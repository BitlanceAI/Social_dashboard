import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

// Isolated module graph: no production environment, database, or Meta calls.
async function load(path, mocks, env = {}) {
    const context = createContext({ console, Buffer, URLSearchParams, Date, setTimeout,
        process: { env }, crypto });
    const mod = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'), { context });
    await mod.link((name) => {
        assert.ok(name in mocks, `Unexpected dependency: ${name}`);
        const values = mocks[name];
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await mod.evaluate();
    return mod.namespace;
}

function database(tables) {
    return { from(table) {
        assert.ok(table in tables, `Unexpected table: ${table}`);
        const filters = [];
        let operation = 'read', value, conflict;
        const field = (row, key) => key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key];
        const execute = (single = false) => {
            let rows = tables[table].filter((r) => filters.every((f) => f(r)));
            if (operation === 'delete') tables[table] = tables[table].filter((r) => !rows.includes(r));
            if (operation === 'update') rows.forEach((r) => Object.assign(r, value));
            if (operation === 'insert' || operation === 'upsert') {
                const existing = operation === 'upsert' && tables[table].find((r) => r[conflict] === value[conflict]);
                if (existing) { Object.assign(existing, value); rows = [existing]; }
                else { const row = { id: crypto.randomUUID(), ...value }; tables[table].push(row); rows = [row]; }
            }
            return { data: single ? rows[0] || null : rows, error: null };
        };
        const q = {
            select() { return q; }, eq(key, v) { filters.push((r) => field(r, key) === v); return q; },
            gt(key, v) { filters.push((r) => field(r, key) > v); return q; },
            lt(key, v) { filters.push((r) => field(r, key) < v); return q; },
            insert(v) { operation = 'insert'; value = v; return q; },
            upsert(v, opts) { operation = 'upsert'; value = v; conflict = opts.onConflict; return q; },
            update(v) { operation = 'update'; value = v; return q; }, delete() { operation = 'delete'; return q; },
            maybeSingle: async () => execute(true), single: async () => execute(true),
            then(resolve) { return Promise.resolve(execute()).then(resolve); },
        };
        return q;
    } };
}

async function harness(t, overrides = {}) {
    const tables = { instagram_oauth_states: [], instagram_connections: [], scheduled_posts: [] };
    const db = database(tables);
    const env = { INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 'secret', ENCRYPTION_KEY: 'a'.repeat(64), ...overrides };
    let exchanges = 0, publishes = 0;
    class Service {
        static getOAuthUrl(client, redirect, state) { return `https://www.instagram.com/oauth/authorize?state=${state}`; }
        static async exchangeCode() { exchanges++; return { accessToken: 'raw-secret-token', expiresIn: 60 * 86400 }; }
        async getProfile() { return { success: true, data: { user_id: '123', username: 'testbrand', account_type: 'BUSINESS' } }; }
        async publishPost() { publishes++; return { success: true, data: { id: 'published-id' } }; }
    }
    const auth = (req, res, next) => {
        if (!req.headers.authorization) return res.status(401).json({ error: 'Sign in.' });
        req.user = { id: req.headers.authorization }; next();
    };
    const workspace = (req, res, next) => { req.workspaceId = req.headers['x-workspace-id'] || 'ws'; next(); };
    const targetId = (id) => `instagram:${id}`;
    const api = await load('../src/modules/instagram/instagram.routes.js', {
        '../../config/env.js': { env: { publicUrl: 'https://api.test', frontendUrl: 'https://app.test' } },
        'node:crypto': { default: crypto }, express: { default: express },
        '../../config/supabase.js': { supabaseAdmin: db },
        '../../middleware/auth.js': { authenticateUser: auth }, '../../middleware/workspace.js': { resolveWorkspace: workspace },
        '../../shared/utils/encryption.js': { encryptData: (v) => `encrypted:${v}` },
        '../../shared/storage/postMedia.js': { postMediaUpload: { array: () => (req, res, next) => next() }, uploadPostMedia: async () => ({ success: true, urls: [] }) },
        '../billing/billing.service.js': { billingOwner: async () => 'owner', getEntitlement: async () => ({ active: true }), dailyPostCapExceeded: async () => false },
        '../whatsapp/whatsapp.service.js': { cleanPhones: () => [], isWhatsAppEnabled: () => false },
        '../approvals/approval.service.js': { rememberApprovers: async () => {}, requestApproval: async () => ({ sent: true }) },
        './instagram.service.js': { default: Service, instagramTargetId: targetId },
        './instagram.connection.js': { instagramClient: async (_, c) => {
            if (!c.is_active || Date.parse(c.token_expires_at) <= Date.now()) throw new Error('Expired');
            return new Service();
        } },
    }, env);
    const app = express(); app.use(express.json()); app.use(api.default);
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
    const request = async (path, body, options = {}) => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
            method: body ? 'POST' : 'GET', redirect: 'manual',
            headers: { 'Content-Type': 'application/json', Authorization: 'user', ...options.headers },
            ...(body ? { body: JSON.stringify(body) } : {}), ...options,
        });
        return { status: res.status, location: res.headers.get('location'), body: await res.json().catch(() => ({})) };
    };
    const verifier = 'b'.repeat(64);
    const start = async () => {
        const result = await request('/oauth/url', { verifier });
        assert.equal(result.status, 200);
        return new URL(result.body.url).searchParams.get('state');
    };
    const ticket = async () => {
        const state = await start();
        const callback = await request(`/oauth/callback?code=code&state=${state}`);
        assert.equal(callback.status, 302);
        assert.ok(!callback.location.includes('raw-secret-token'));
        return new URL(callback.location).searchParams.get('instagram_ticket');
    };
    return { tables, db, api, env, request, start, ticket, verifier, counts: () => ({ exchanges, publishes }) };
}

test('configuration error names only missing variables and distinguishes an invalid encryption key', async (t) => {
    const h = await harness(t, { INSTAGRAM_APP_ID: '', INSTAGRAM_APP_SECRET: '' });
    const missing = await h.request('/oauth/url', { verifier: h.verifier });
    assert.equal(missing.status, 503);
    assert.deepEqual(missing.body.missing, ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET']);
    h.env.INSTAGRAM_APP_ID = 'configured'; h.env.INSTAGRAM_APP_SECRET = 'secret'; h.env.ENCRYPTION_KEY = '';
    const invalid = await h.request('/oauth/url', { verifier: h.verifier });
    assert.equal(invalid.body.code, 'INSTAGRAM_ENCRYPTION_NOT_CONFIGURED');
    assert.equal(h.counts().exchanges, 0);
});

test('OAuth completes once, binds browser/user/workspace, stores encrypted token, and never returns credentials', async (t) => {
    const h = await harness(t);
    const ticket = await h.ticket();
    assert.ok(ticket);
    for (const [verifier, headers] of [
        ['c'.repeat(64), { Authorization: 'user', 'x-workspace-id': 'ws' }],
        [h.verifier, { Authorization: 'attacker', 'x-workspace-id': 'ws' }],
        [h.verifier, { Authorization: 'user', 'x-workspace-id': 'foreign' }],
    ]) {
        const result = await h.request('/oauth/complete', { ticket, verifier }, { headers: { 'Content-Type': 'application/json', ...headers } });
        assert.equal(result.status, 400);
        assert.equal(h.tables.instagram_connections.length, 0);
    }
    assert.equal((await h.request('/oauth/complete', { ticket, verifier: h.verifier })).status, 200);
    assert.equal(h.tables.instagram_connections[0].access_token, 'encrypted:raw-secret-token');
    assert.equal(h.tables.instagram_connections[0].workspace_id, 'ws');
    assert.equal((await h.request('/oauth/complete', { ticket, verifier: h.verifier })).status, 400);
    const connection = await h.request('/connection');
    assert.equal(connection.body.account.id, 'instagram:123');
    assert.equal(JSON.stringify(connection.body).includes('token'), false);
});

test('callback rejects forged, expired and reused states; cancelled consent does not exchange tokens', async (t) => {
    const h = await harness(t);
    const bad = await h.request(`/oauth/callback?code=code&state=${'f'.repeat(64)}`);
    assert.ok(new URL(bad.location).searchParams.get('error'));
    const cancelled = await h.start();
    const cancel = await h.request(`/oauth/callback?error=access_denied&state=${cancelled}`);
    assert.match(new URL(cancel.location).searchParams.get('error'), /cancelled/);
    const state = await h.start();
    h.tables.instagram_oauth_states[0].expires_at = '2000-01-01T00:00:00.000Z';
    await h.request(`/oauth/callback?code=code&state=${state}`);
    assert.equal(h.counts().exchanges, 0);
    const fresh = await h.start();
    await h.request(`/oauth/callback?code=code&state=${fresh}`);
    await h.request(`/oauth/callback?code=code&state=${fresh}`);
    assert.equal(h.counts().exchanges, 1);
});

test('publish and schedule use only the connected Instagram account; disconnect is workspace-scoped', async (t) => {
    const h = await harness(t);
    const ticket = await h.ticket();
    await h.request('/oauth/complete', { ticket, verifier: h.verifier });
    const body = { pageId: 'instagram:123', content: 'Caption', platforms: ['instagram'], mediaUrls: ['https://media.test/a.jpg'] };
    assert.equal((await h.request('/posts/publish', { ...body, pageId: 'instagram:other' })).status, 403);
    assert.equal((await h.request('/posts/publish', { ...body, platforms: ['facebook'] })).status, 400);
    assert.equal((await h.request('/posts/publish', { ...body, mediaUrls: [] })).status, 400);
    assert.equal(h.counts().publishes, 0);
    assert.equal((await h.request('/posts/publish', body)).status, 200);
    assert.equal(h.tables.scheduled_posts[0].status, 'published');
    assert.equal(h.tables.scheduled_posts[0].provider, 'instagram');
    assert.equal(h.tables.scheduled_posts[0].meta_connection_id, undefined);
    assert.equal((await h.request('/posts/schedule', { ...body, scheduledTime: new Date(Date.now() + 86400000).toISOString() })).status, 200);
    assert.equal(h.tables.scheduled_posts[1].status, 'pending');
    assert.equal(h.counts().publishes, 1);
    assert.equal((await h.request(`/posts/${h.tables.scheduled_posts[1].id}`, null, { method: 'DELETE' })).status, 200);
    assert.equal((await h.request(`/posts/${h.tables.scheduled_posts[0].id}`, null, { method: 'DELETE' })).status, 409);
    h.tables.instagram_connections.push({ id: 'foreign', workspace_id: 'other' });
    await h.request('/disconnect', null, { method: 'DELETE' });
    assert.deepEqual(h.tables.instagram_connections.map((c) => c.id), ['foreign']);
});

test('reconnect preserves identity and refuses to silently replace an account', async (t) => {
    const h = await harness(t);
    h.tables.instagram_connections.push({ id: 'existing', workspace_id: 'ws', instagram_user_id: 'different' });
    assert.equal((await h.request('/oauth/complete', { ticket: await h.ticket(), verifier: h.verifier })).status, 409);
    h.tables.instagram_connections[0].instagram_user_id = '123';
    assert.equal((await h.request('/oauth/complete', { ticket: await h.ticket(), verifier: h.verifier })).status, 200);
    assert.equal(h.tables.instagram_connections.length, 1);
    assert.equal(h.tables.instagram_connections[0].id, 'existing');
});

test('signed deauthorization validates the signature before removing any connection', async (t) => {
    const h = await harness(t);
    h.tables.instagram_connections.push({ id: 'own', instagram_user_id: '123' }, { id: 'other', instagram_user_id: '456' });
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '123' })).toString('base64url');
    assert.equal((await h.request('/deauthorize', { signed_request: `bad.${payload}` })).status, 400);
    assert.equal(h.tables.instagram_connections.length, 2);
    const signature = crypto.createHmac('sha256', 'secret').update(payload).digest('base64url');
    assert.equal((await h.request('/deauthorize', { signed_request: `${signature}.${payload}` })).status, 200);
    assert.deepEqual(h.tables.instagram_connections.map((c) => c.id), ['other']);
});

test('direct Instagram publishing creates and waits for carousel children, and stops on processing errors', async () => {
    const { default: Service } = await load('../src/modules/instagram/instagram.service.js', {
        '../../config/env.js': {}, axios: { default: {} },
        '../meta/meta.service.js': { isVideoUrl: (url) => url.endsWith('.mp4') },
    });
    const calls = [];
    const client = { request: async (config) => {
        calls.push(config);
        return { data: config.method === 'GET' ? { status_code: 'FINISHED' } : { id: `id-${calls.length}` } };
    } };
    const service = new Service('token', client);
    const result = await service.publishPost('123', { caption: 'Caption', mediaUrls: ['https://media.test/a.jpg', 'https://media.test/b.mp4'] });
    assert.equal(result.success, true);
    assert.equal(calls[2].data.media_type, 'VIDEO');
    assert.equal(calls[2].data.is_carousel_item, true);
    assert.equal(calls[4].data.media_type, 'CAROUSEL');
    assert.equal(calls.at(-1).url, '/123/media_publish');
    assert.ok(calls.every((c) => c.headers.Authorization === 'Bearer token'));
    calls.length = 0;
    await service.publishPost('123', { caption: '', mediaUrls: ['https://media.test/b.mp4'] });
    assert.equal(calls[0].data.media_type, 'REELS');
    const failed = new Service('token', { request: async (c) => ({ data: c.method === 'GET' ? { status_code: 'ERROR', status: 'Invalid media' } : { id: 'container' } }) });
    assert.equal((await failed.publishPost('123', { mediaUrls: ['https://media.test/a.jpg'] })).success, false);
});

test('token renewal persists near-expiry credentials and rejects expired/inactive connections', async () => {
    let refreshes = 0;
    class Service {
        constructor(token) { this.accessToken = token; }
        async refreshToken() { refreshes++; return { access_token: 'renewed', expires_in: 60 * 86400 }; }
    }
    const api = await load('../src/modules/instagram/instagram.connection.js', {
        './instagram.service.js': { default: Service },
        '../../shared/utils/encryption.js': { encryptData: (v) => `encrypted:${v}`, decryptData: () => 'old' },
    });
    const c = { id: 'ig', is_active: true, access_token: 'encrypted:old', token_expires_at: new Date(Date.now() + 2 * 86400000).toISOString() };
    const tables = { instagram_connections: [c] };
    const service = await api.instagramClient(database(tables), { ...c });
    assert.equal(service.accessToken, 'renewed');
    assert.equal(c.access_token, 'encrypted:renewed');
    assert.ok(Date.parse(c.token_expires_at) > Date.now() + 59 * 86400000);
    await api.instagramClient(database(tables), { ...c });
    assert.equal(refreshes, 1);
    await assert.rejects(api.instagramClient(database(tables), { ...c, is_active: false }), /disconnected/);
    await assert.rejects(api.instagramClient(database(tables), { ...c, token_expires_at: '2000-01-01' }), /expired/);
});
