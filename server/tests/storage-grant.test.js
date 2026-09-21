import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { createStorageGrant } from '../src/modules/admin/storage-grant.js';

const userId = '00000000-0000-0000-0000-000000000001';
const adminId = '00000000-0000-0000-0000-000000000002';
const input = { userId, gb: 10, months: 1 };
function database(user = { id: userId }) {
    const rows = [];
    return { rows, auth: { admin: { getUserById: async () => ({ data: { user } }) } },
        from: () => ({ insert: row => {
            rows.push(row);
            return { select: () => ({ single: async () => ({ data: row }) }) };
        } }),
    };
}

test('free grant records issuer, starts immediately and clamps month-end expiry', async () => {
    const db = database();
    const grant = await createStorageGrant(db, adminId, input, new Date('2026-01-31T10:00:00Z'));
    assert.equal(grant.amount, 0);
    assert.equal(grant.status, 'granted');
    assert.equal(grant.granted_by, adminId);
    assert.equal(grant.user_id, userId);
    assert.equal(grant.expires_at, '2026-02-28T10:00:00.000Z');
    assert.equal(grant.razorpay_order_id, undefined);
});

test('invalid user IDs, sizes and durations cannot write a grant', async () => {
    const db = database();
    for (const patch of [{ userId: 'bad' }, { gb: 0 }, { gb: 1001 }, { gb: 1.5 }, { gb: '10' }, { months: 0 }, { months: 25 }]) {
        await assert.rejects(createStorageGrant(db, adminId, { ...input, ...patch }), { status: 400 });
    }
    assert.equal(db.rows.length, 0);
    const missing = database(null);
    await assert.rejects(createStorageGrant(missing, adminId, input), { status: 404 });
    assert.equal(missing.rows.length, 0);
});

async function loadModule(path, dependencies) {
    const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), 'utf8'));
    await module.link(specifier => {
        const exports = dependencies[specifier] || {};
        return new SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    return module.namespace;
}

test('grants add to paid storage; expired grants do not count, even with over 20 history rows', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    const rows = [
        ...Array.from({ length: 21 }, () => ({ status: 'created', gb: 100 })),
        { status: 'granted', gb: 10, expires_at: future },
        { status: 'paid', gb: 5, expires_at: future },
        { status: 'granted', gb: 30, expires_at: past },
    ];
    const db = { from(table) {
        const query = {
            select: () => query, eq: () => query, order: () => query,
            single: async () => ({ data: { delete_after_days: 30 } }),
            then: resolve => resolve({ data: table === 'storage_purchases' ? rows : [] }),
        };
        return query;
    } };
    const service = await loadModule('../src/modules/storage/storage.service.js', {
        crypto: { default: {} },
        '../../config/supabase.js': { supabaseAdmin: db },
        '../../shared/storage/bunny.js': { isBunnyConfigured() {}, isBunnyUrl() {}, bunnyUpload() {}, bunnyRemove() {} },
        '../push/push.service.js': { sendToUser() {} },
    });
    const entitlement = await service.getEntitlement(userId);
    assert.equal(entitlement.activeGb, 15);
    assert.equal(entitlement.purchases.length, 20);
});

test('admin middleware rejects ordinary users', async () => {
    const { requireAdmin } = await loadModule('../src/modules/admin/admin.middleware.js', {
        '../../config/supabase.js': { supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'user' } }) }) }) }) } },
    });
    let status;
    await requireAdmin({ user: { id: userId } }, { status(code) { status = code; return this; }, json() {} }, () => assert.fail('Non-admin allowed'));
    assert.equal(status, 403);
});
