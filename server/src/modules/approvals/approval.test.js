import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { loadApprovalQueue, parseQueuePage, settlePendingPost, settleRepostDeliveries } from './approval.store.js';

// In-memory PostgREST double: updates evaluate their predicates at commit time.
function database(rows) {
    return { from(table) {
        assert.equal(table, 'scheduled_posts');
        const filters = [];
        const orders = [];
        let patch;
        let start = 0;
        let end = Infinity;
        const query = {
            select() { return query; },
            eq(key, value) { filters.push(row => row[key] === value); return query; },
            not(key, operator, value) { assert.equal(operator, 'is'); filters.push(row => (row[key] ?? null) !== value); return query; },
            in(key, values) { filters.push(row => values.includes(row[key])); return query; },
            order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query; },
            range(a, b) { start = a; end = b; return query; },
            update(value) { patch = value; return query; },
            async maybeSingle() {
                const row = rows.find(row => filters.every(filter => filter(row)));
                if (row && patch) Object.assign(row, patch);
                return { data: row ? { ...row } : null, error: null };
            },
            then(resolve) {
                const selected = rows.filter(row => filters.every(filter => filter(row))).sort((a, b) => {
                    for (const [key, ascending] of orders) {
                        const comparison = String(a[key]).localeCompare(String(b[key]));
                        if (comparison) return ascending ? comparison : -comparison;
                    }
                    return 0;
                });
                return Promise.resolve({ data: selected.slice(start, end + 1), count: selected.length, error: null }).then(resolve);
            },
        };
        return query;
    } };
}

async function service(db) {
    const module = new SourceTextModule(await readFile(new URL('./approval.service.js', import.meta.url), 'utf8'));
    const mocks = {
        '../../config/env.js': {},
        '../../config/supabase.js': { supabaseAdmin: db },
        './approval.store.js': { settlePendingPost, settleRepostDeliveries },
        '../push/push.service.js': { sendToWorkspace: async () => {} },
        '../whatsapp/whatsapp.service.js': {
            isWhatsAppEnabled: () => true, cleanPhones: phones => phones,
            rowApproverPhones: row => row.approver_phones || [],
            sendApprovalTemplate: async () => ({ success: false, error: 'Delivery failed' }),
            sendTextMessage: async () => ({ success: true }),
        },
    };
    await module.link(specifier => {
        assert.ok(specifier in mocks, `Unexpected dependency (publishing must stay in scheduler): ${specifier}`);
        const exports = mocks[specifier];
        return new SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    return module.namespace;
}

test('queue isolates workspaces, counts before pagination, and excludes settled/unreviewed posts', async () => {
    const rows = Array.from({ length: 27 }, (_, i) => ({ id: String(i).padStart(2, '0'), workspace_id: 'a', status: 'pending_approval', created_at: '2026-09-01' }));
    rows.push({ id: 'foreign', workspace_id: 'b', status: 'pending_approval' });
    for (const status of ['pending', 'processing', 'scheduled', 'published', 'failed', 'cancelled']) {
        rows.push({ id: status, workspace_id: 'a', status, approved_at: '2026-09-01', scheduled_time: '2026-09-15' });
    }
    rows.push({ id: 'optional', workspace_id: 'a', status: 'pending' });
    const result = await loadApprovalQueue(database(rows), 'a', 2, 1);
    assert.equal(result.pendingCount, 27);
    assert.deepEqual(result.posts.map(row => row.id), ['25', '26']);
    assert.equal(result.approvedCount, 3);
    assert.deepEqual(result.approvedPosts.map(row => row.status), ['pending', 'processing', 'scheduled']);
});

test('rejected queue preserves feedback, paginates newest first, and excludes other workspaces and ordinary cancellations', async () => {
    const rows = Array.from({ length: 27 }, (_, i) => ({
        id: String(i).padStart(2, '0'), workspace_id: 'a', status: 'cancelled',
        rejected_at: new Date(Date.UTC(2026, 8, 1, i)).toISOString(),
        rejected_by: '919876543210', rejection_comment: `Reason ${i}`, awaiting_rejection_feedback: false,
    }));
    rows.push({ ...rows[0], id: 'foreign', workspace_id: 'b' });
    rows.push({ id: 'manual-cancellation', workspace_id: 'a', status: 'cancelled' });
    rows.push({ ...rows[0], id: 'rescheduled', status: 'pending' });
    const first = await loadApprovalQueue(database(rows), 'a');
    assert.equal(first.rejectedCount, 27);
    assert.equal(first.rejectedPosts.length, 25);
    assert.equal(first.rejectedPosts[0].id, '26');
    assert.equal(first.rejectedPosts[0].rejection_comment, 'Reason 26');
    assert.equal(first.rejectedPosts[0].rejected_by, '919876543210');
    assert.equal(first.rejectedPosts[0].awaiting_rejection_feedback, false);
    const second = await loadApprovalQueue(database(rows), 'a', 1, 1, 2);
    assert.equal(second.rejectedCount, 27);
    assert.equal(second.rejectedPage, 2);
    assert.deepEqual(second.rejectedPosts.map(row => row.id), ['01', '00']);
});

test('invalid page inputs are rejected', () => {
    for (const value of ['0', '-1', '1.5', 'abc', '', '100001', ['1', '2']]) assert.equal(parseQueuePage(value), null);
    assert.equal(parseQueuePage(undefined), 1);
    assert.equal(parseQueuePage('2'), 2);
});

test('simultaneous approvals release a post exactly once without publishing calls', async () => {
    const post = { id: 'p', workspace_id: 'a', status: 'pending_approval' };
    const api = await service(database([post]));
    const results = await Promise.all([api.activateApprovedPost({ ...post }), api.activateApprovedPost({ ...post })]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(post.status, 'pending');
    assert.ok(post.approved_at);
});

test('rejection wins against approval and stores reason atomically', async () => {
    const post = { id: 'p', workspace_id: 'a', status: 'pending_approval' };
    const api = await service(database([post]));
    const [rejected, approved] = await Promise.all([
        api.rejectPendingPost({ ...post }, { by: 'reviewer', reason: ' Fix caption ' }),
        api.activateApprovedPost({ ...post }),
    ]);
    assert.equal(rejected.rejection_comment, 'Fix caption');
    assert.equal(rejected.rejected_by, 'reviewer');
    assert.equal(approved, null);
    assert.equal(post.status, 'cancelled');
    assert.equal(post.approved_at, undefined);
});

test('settling cannot update a different workspace or a settled post', async () => {
    const post = { id: 'p', workspace_id: 'a', status: 'pending_approval' };
    const api = await service(database([post]));
    assert.equal(await api.activateApprovedPost({ ...post, workspace_id: 'b' }), null);
    await api.activateApprovedPost(post);
    assert.equal(await api.rejectPendingPost(post, { reason: 'Late rejection' }), null);
    assert.equal(post.rejection_comment, undefined);
});

test('one repost decision settles all destinations in its workspace and leaves the next source waiting', async () => {
    const rows = [
        { id: 'a', workspace_id: 'w', repost_source_post_id: 'source-1', status: 'pending_approval' },
        { id: 'b', workspace_id: 'w', repost_source_post_id: 'source-1', status: 'pending_approval' },
        { id: 'next', workspace_id: 'w', repost_source_post_id: 'source-2', status: 'pending_approval' },
        { id: 'foreign', workspace_id: 'other', repost_source_post_id: 'source-1', status: 'pending_approval' },
    ];
    const db = database(rows);
    const api = await service(db);
    const first = await api.activateApprovedPost({ ...rows[0] }, { by: 'whatsapp' });
    await settleRepostDeliveries(db, first, api.activateApprovedPost, api.rejectPendingPost);
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[1].status, 'pending');
    assert.equal(rows[1].approved_by, 'whatsapp');
    assert.equal(rows[2].status, 'pending_approval');
    assert.equal(rows[3].status, 'pending_approval');
});

test('failed WhatsApp send keeps the post in the pending queue', async () => {
    const post = { id: 'p', workspace_id: 'a', status: 'pending_approval', approver_phones: ['919876543210'], scheduled_time: '2026-09-15' };
    const db = database([post]);
    const api = await service(db);
    assert.equal((await api.requestApproval(post)).sent, false);
    assert.equal((await loadApprovalQueue(db, 'a')).pendingCount, 1);
});

test('explicit approval defaults persist independently of previously used numbers', async () => {
    let settings = {};
    const db = { from(table) {
        assert.equal(table, 'approval_settings');
        return {
            select() { return this; }, eq() { return this; },
            async upsert(row) { settings = { ...settings, ...row }; return { error: null }; },
            async maybeSingle() { return { data: settings, error: null }; },
        };
    } };
    const api = await service(db);
    await api.setSavedApprovers('a', ['11111111111', '22222222222'], ['22222222222']);
    assert.deepEqual(await api.getDefaultApprovers('a'), ['22222222222']);
    await api.rememberApprovers('a', ['33333333333']);
    assert.deepEqual(await api.getDefaultApprovers('a'), ['22222222222']);
    await api.setSavedApprovers('a', settings.phones, []);
    assert.deepEqual(await api.getDefaultApprovers('a'), []);
    assert.equal(settings.phones.length, 3);
});
