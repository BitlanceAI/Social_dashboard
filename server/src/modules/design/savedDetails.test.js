import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

test('saved details persist per workspace, validate inputs, and report database failures', async () => {
    const rows = new Map();
    const handlers = {};
    let fail = false;
    const db = { from(table) {
        assert.equal(table, 'template_saved_details');
        let workspace;
        let value;
        return {
            select() { return this; },
            eq(key, id) { assert.equal(key, 'workspace_id'); workspace = id; return this; },
            upsert(row) { value = row; return this; },
            async maybeSingle() { return { data: rows.get(workspace) || null, error: null }; },
            async single() {
                if (fail) throw new Error('Database unavailable');
                rows.set(value.workspace_id, value);
                return { data: value, error: null };
            },
        };
    } };
    const router = { use() {}, get(path, handler) { handlers.get = handler; }, put(path, handler) { handlers.put = handler; } };
    const mocks = {
        express: { default: { Router: () => router } },
        '../../config/supabase.js': { supabaseAdmin: db },
        '../../middleware/workspace.js': { resolveWorkspace: () => {} },
    };
    const module = new SourceTextModule(await readFile(new URL('./savedDetails.routes.js', import.meta.url), 'utf8'));
    await module.link(name => {
        const exports = mocks[name];
        assert.ok(exports);
        return new SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    async function request(method, workspaceId, body) {
        const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        await handlers[method]({ workspaceId, body }, response);
        return response;
    }
    const details = { field_values: { company: 'Bitlance', phone: '919876543210' }, language: 'hi', include_contact: false, auto_reuse: true };
    assert.equal((await request('get', 'a')).data.details, null);
    assert.equal((await request('put', 'a', details)).code, 200);
    assert.equal((await request('get', 'a')).data.details.field_values.company, 'Bitlance');
    assert.equal((await request('get', 'b')).data.details, null);
    assert.equal((await request('put', 'a', { ...details, language: 'invalid' })).code, 400);
    assert.equal((await request('put', 'a', { ...details, field_values: { company: {} } })).code, 400);
    assert.equal((await request('put', 'a', { ...details, field_values: { constructor: 'unsafe' } })).code, 400);
    fail = true;
    assert.equal((await request('put', 'a', details)).code, 500);
});
