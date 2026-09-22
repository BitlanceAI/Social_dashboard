import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as contentHelpers from '../src/shared/utils/pipeline-content.mjs';

async function load(path, mocks, globals = {}) {
    mocks['../../shared/utils/pipeline-content.mjs'] = contentHelpers;
    const context = createContext({ console, AbortSignal, process: { env: { PERPLEXITY_API_KEY: 'test' } }, ...globals });
    const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'), { context });
    await module.link(name => {
        assert.ok(name in mocks, `Unexpected dependency ${name}`);
        const values = mocks[name];
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

function database(tables) {
    return { from(table) {
        assert.ok(table in tables, `Unexpected table ${table}`);
        const filters = [];
        let patch, inserted, limit = Infinity;
        const execute = single => {
            let rows = tables[table].filter(row => filters.every(f => f(row))).slice(0, limit);
            if (inserted) { rows = (Array.isArray(inserted) ? inserted : [inserted]).map((value, index) => ({ id: `new-${tables[table].length + index}`, ...value })); tables[table].push(...rows); }
            if (patch) rows.forEach(row => Object.assign(row, patch));
            return { data: single ? rows[0] || null : rows.map(row => ({ ...row })), error: null };
        };
        const q = {
            select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
            order() { return q; }, limit(n) { limit = n; return q; },
            update(value) { patch = value; return q; }, insert(value) { inserted = value; return q; },
            single: async () => execute(true), maybeSingle: async () => execute(true),
            then(resolve) { return Promise.resolve(execute(false)).then(resolve); },
        };
        return q;
    } };
}

async function executor({ phones = ['919876543210'], pipelinePhones, enabled = true, failedDelivery = false } = {}) {
    const tables = {
        content_pipelines: [{ id: 'pipe', workspace_id: 'a', user_id: 'user', status: 'active', auto_publish: false, provider: 'linkedin', approver_phones: pipelinePhones }],
        content_queue: [{ id: 'item', pipeline_id: 'pipe', workspace_id: 'a', status: 'pending', title_hook: 'Hook' }],
        linkedin_connections: [{ id: 'li', workspace_id: 'a', is_active: true, author_urn: 'urn:li:person:123' }],
        scheduled_posts: [],
    };
    const db = database(tables);
    const deliveries = [];
    const noPublish = class { constructor() { throw new Error('Must not publish before approval'); } };
    const api = await load('../src/modules/pipelines/pipeline_executor.service.js', {
        '../../config/env.js': {}, '../../config/supabase.js': { supabaseAdmin: db, supabase: db },
        '../billing/billing.service.js': { reserveUsage: async () => null, releaseUsage: async () => {} },
        '../meta/meta.service.js': { default: noPublish }, '../linkedin/linkedin.service.js': { default: noPublish },
        '../instagram/instagram.connection.js': { instagramClient: async () => { throw new Error('Must not publish before approval'); } },
        '../instagram/instagram.service.js': { instagramTargetId: id => `instagram:${id}` },
        '../../shared/utils/encryption.js': { decryptData: () => { throw new Error('Unexpected decryption'); } },
        sharp: { default: () => {} },
        '../approvals/approval.service.js': { getDefaultApprovers: async workspace => { assert.equal(workspace, 'a'); return phones; },
            requestApproval: async post => { deliveries.push(post); return { sent: !failedDelivery, reached: failedDelivery ? 0 : phones.length, error: failedDelivery ? 'Delivery failed' : undefined }; } },
        '../whatsapp/whatsapp.service.js': { isWhatsAppEnabled: () => enabled },
        './pipeline.service.js': { addQueueItems: async () => [] },
        '../design/generation.service.js': { isOpenAIConfigured: () => false, generateImage: () => {} },
        '../../shared/storage/bunny.js': { isBunnyConfigured: () => false, bunnyUpload: () => {} },
    }, { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"caption":"Caption","hashtags":"#Tech"}' } }] }) }) });
    return { api, tables, deliveries };
}

test('pipeline uses workspace defaults and queues for approval without publishing', async () => {
    const { api, tables, deliveries } = await executor();
    const result = await api.runPipeline('pipe', 'a');
    assert.equal(result.postStatus, 'pending_approval');
    assert.equal(tables.content_queue[0].status, 'pending_approval');
    assert.equal(tables.content_queue[0].scheduled_post_id, tables.scheduled_posts[0].id);
    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0].approver_phones, ['919876543210']);
});

test('pipeline run denies foreign and missing workspaces before generation', async () => {
    const { api, tables, deliveries } = await executor();
    await assert.rejects(api.runPipeline('pipe', 'b'), /not found/);
    await assert.rejects(api.runPipeline('pipe'), /workspace/);
    assert.equal(tables.content_queue[0].status, 'pending');
    assert.equal(deliveries.length, 0);
});

test('missing configuration or failed delivery keeps a dashboard approval and visible notice', async () => {
    for (const options of [{ phones: [] }, { enabled: false }, { failedDelivery: true }]) {
        const { api, tables } = await executor(options);
        const result = await api.runPipeline('pipe', 'a');
        assert.equal(result.approvalDelivery.sent, false);
        assert.equal(tables.scheduled_posts[0].status, 'pending_approval');
        assert.ok(tables.content_queue[0].error_message);
    }
});

test('pipeline updates cannot overwrite workspace, owner or run metadata', async () => {
    const tables = { content_pipelines: [{ id: 'pipe', workspace_id: 'a', user_id: 'owner' }] };
    const db = database(tables);
    const api = await load('../src/modules/pipelines/pipeline.service.js', { '../../config/supabase.js': { supabaseAdmin: db, supabase: db } });
    await api.updatePipeline('pipe', 'a', { workspace_id: 'b', user_id: 'attacker', last_run_at: 'bad', caption_prompt_template: 'Allowed', auto_publish: false });
    assert.equal(tables.content_pipelines[0].workspace_id, 'a');
    assert.equal(tables.content_pipelines[0].user_id, 'owner');
    assert.equal(tables.content_pipelines[0].last_run_at, undefined);
    assert.equal(tables.content_pipelines[0].caption_prompt_template, 'Allowed');
    assert.equal(tables.content_pipelines[0].auto_publish, false);
});

test('pipeline-specific approval numbers override workspace defaults; empty lists use defaults', async () => {
    for (const pipelinePhones of [['447700900123'], []]) {
        const { api, deliveries } = await executor({ pipelinePhones });
        await api.runPipeline('pipe', 'a');
        assert.deepEqual(deliveries[0].approver_phones, pipelinePhones.length ? pipelinePhones : ['919876543210']);
    }
});

test('pipeline approval numbers are saved, validated, retained on unrelated edits, and cleared', async () => {
    const tables = { content_pipelines: [] };
    const db = database(tables);
    const api = await load('../src/modules/pipelines/pipeline.service.js', { '../../config/supabase.js': { supabaseAdmin: db, supabase: db } });
    const created = await api.createPipeline('a', 'user', { name: 'Review', autoPublish: false, approverPhones: '+91 98765 43210, +447700900123, 919876543210' });
    assert.deepEqual(Array.from(created.approver_phones), ['919876543210', '447700900123']);
    await api.updatePipeline(created.id, 'a', { name: 'Renamed' });
    assert.equal(tables.content_pipelines[0].approver_phones.length, 2);
    await assert.rejects(api.updatePipeline(created.id, 'a', { approverPhones: 'invalid123' }), /valid WhatsApp/);
    assert.equal(tables.content_pipelines[0].approver_phones.length, 2);
    await api.updatePipeline(created.id, 'a', { approver_phones: ['+447700900124'] });
    assert.deepEqual(Array.from(tables.content_pipelines[0].approver_phones), ['447700900124']);
    await api.updatePipeline(created.id, 'a', { approverPhones: '' });
    assert.equal(tables.content_pipelines[0].approver_phones.length, 0);
});

test('reimport skips existing content and Posted source rows, preserves full briefs', async () => {
    const tables = { content_pipelines: [{ id: 'pipe', workspace_id: 'a' }], content_queue: [] };
    const db = database(tables);
    const api = await load('../src/modules/pipelines/pipeline.service.js', { '../../config/supabase.js': { supabaseAdmin: db, supabase: db } });
    const item = { Day: '17', Date: 'Wed, 30 Sep 2026', Status: 'Pending', 'Post Title / Hook': 'Every branch, one agent', 'Content Pillar': 'Feature Highlight', 'Caption Outline': 'Route calls, book appointments, and send reminders.', Format: 'Carousel', CTA: 'Book a demo' };
    const first = await api.addQueueItems('pipe', 'a', [item, item, { ...item, Day: '18', Status: 'Posted' }]);
    assert.equal(first.length, 1);
    assert.equal(first[0].date_str, 'Wed, 30 Sep 2026');
    assert.equal(first[0].caption_outline, item['Caption Outline']);
    assert.equal((await api.addQueueItems('pipe', 'a', [item])).length, 0);
    assert.equal(tables.content_queue.length, 1);
});

async function revisions({ aiContent = 'Revised caption', stale = false, deliveryFails = false } = {}) {
    const rejected = { id: 'post', workspace_id: 'a', status: 'cancelled', rejected_at: '2026-09-01', content: 'Original', rejection_comment: 'Shorter', approver_phones: ['919876543210'] };
    const db = database({ scheduled_posts: [rejected] });
    const calls = [];
    db.rpc = async (name, args) => { calls.push({ name, args }); return stale ? { error: { code: '40001' } } : { data: { id: 'new-post', status: 'pending_approval' } }; };
    const api = await load('../src/modules/approvals/revision.service.js', {
        '../../config/env.js': {}, '../../config/supabase.js': { supabaseAdmin: db },
        '../billing/billing.service.js': { withGenerationUsage: async (user, workspace, operation) => { assert.equal(workspace, 'a'); return operation(); } },
        './approval.service.js': { getDefaultApprovers: async () => [], requestApproval: async () => { if (deliveryFails) throw new Error('Delivery failed'); return { sent: true, reached: 1 }; } },
        '../whatsapp/whatsapp.service.js': { isWhatsAppEnabled: () => true, rowApproverPhones: post => post.approver_phones || [] },
    }, { fetch: async (url, options) => { assert.match(options.body, /Original/); assert.match(options.body, /Shorter/); return { ok: true, json: async () => ({ choices: [{ message: { content: aiContent } }] }) }; } });
    return { api, rejected, calls };
}

test('AI revision is a preview using original content and feedback; no post is resubmitted', async () => {
    const { api, rejected, calls } = await revisions();
    const result = await api.generateRevision(rejected, 'user');
    assert.equal(result.caption, 'Revised caption');
    assert.equal(result.originalContent, 'Original');
    assert.equal(result.feedback, 'Shorter');
    assert.equal(rejected.content, 'Original');
    assert.equal(calls.length, 0);
    await assert.rejects(api.generateRevision({ ...rejected, rejection_comment: '' }, 'user'), /feedback/);
    await assert.rejects(api.loadRejectedPost('post', 'b'), /not found/);
});

test('resubmission forwards reviewed text and stale checks, preserving success if WhatsApp fails', async () => {
    const { api, rejected, calls } = await revisions({ deliveryFails: true });
    const result = await api.resubmitRevision(rejected, { content: ' Edited revision ', originalContent: 'Original', feedback: 'Shorter' });
    assert.equal(calls[0].args.p_content, 'Edited revision');
    assert.equal(calls[0].args.p_workspace_id, 'a');
    assert.equal(calls[0].args.p_expected_feedback, 'Shorter');
    assert.equal(result.success, true);
    assert.equal(result.delivery.sent, false);
    assert.equal(result.post.status, 'pending_approval');
    const stale = await revisions({ stale: true });
    await assert.rejects(stale.api.resubmitRevision(stale.rejected, { content: 'Revision', originalContent: 'Original', feedback: 'Shorter' }), err => err.status === 409);
});

test('invalid AI output and blank resubmissions are rejected', async () => {
    const { api, rejected, calls } = await revisions({ aiContent: '' });
    await assert.rejects(api.generateRevision(rejected, 'user'), /invalid caption/);
    await assert.rejects(api.resubmitRevision(rejected, { content: ' ' }), /caption/);
    assert.equal(calls.length, 0);
});
