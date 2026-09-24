import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

async function run({ authorized = true, members = [], profiles = [] } = {}) {
    const calls = [];
    const db = { from(table) {
        const call = { table, filters: [] };
        calls.push(call);
        const query = {
            select(columns) { call.columns = columns; return query; },
            eq(key, value) { call.filters.push([key, value]); return query; },
            in(key, value) { call.filters.push([key, value]); return query; },
            maybeSingle: async () => ({ data: authorized ? { role: 'owner' } : null }),
            then(resolve) { return Promise.resolve({ data: table === 'users' ? profiles : members }).then(resolve); },
        };
        return query;
    } };
    const dependencies = {
        crypto: { default: {} },
        '../../config/supabase.js': { supabaseAdmin: db },
        '../storage/storage.service.js': { purgeWorkspaceMedia() {} },
        '../billing/billing.service.js': { wouldExceed() {} },
    };
    const module = new SourceTextModule(await readFile(new URL('../src/modules/workspace/workspace.controller.js', import.meta.url), 'utf8'));
    await module.link(specifier => {
        const exports = dependencies[specifier] || {};
        return new SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    let status = 200;
    let body;
    await module.namespace.listMembers({ params: { id: 'workspace-a' }, user: { id: 'caller' } }, {
        status(code) { status = code; return this; },
        json(value) { body = value; },
    });
    return { status, body, calls };
}

test('joins roster profiles by ID without requiring a PostgREST relationship', async () => {
    const result = await run({
        members: [{ user_id: 'a', role: 'owner', created_at: 'today' }, { user_id: 'b', role: 'client' }],
        profiles: [{ id: 'b', email: 'b@example.com', name: 'Client' }, { id: 'a', email: 'a@example.com', name: 'Owner' }],
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.members.map(m => m.name), ['Owner', 'Client']);
    assert.equal(result.calls[1].columns, 'user_id, role, created_at');
    assert.deepEqual(result.calls[1].filters, [['workspace_id', 'workspace-a']]);
    assert.deepEqual(result.calls[2].filters, [['id', ['a', 'b']]]);
});

test('missing public profile preserves the membership', async () => {
    const result = await run({ members: [{ user_id: 'missing', role: 'member' }] });
    assert.equal(result.body.members.length, 1);
    assert.equal(result.body.members[0].email, null);
    assert.equal(result.body.members[0].name, null);
});

test('empty roster skips the profile query', async () => {
    const result = await run();
    assert.deepEqual(result.body.members, []);
    assert.equal(result.calls.length, 2);
});

test('non-members cannot read roster or profile details', async () => {
    const result = await run({ authorized: false });
    assert.equal(result.status, 404);
    assert.equal(result.calls.length, 1);
});
