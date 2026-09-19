import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://billing-test.invalid';
process.env.SUPABASE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { supabaseAdmin } = await import('../src/config/supabase.js');
const { matchesExemptIdentity, isBillingExempt } = await import('../src/modules/billing/billing-exemption.js');
const { ensureSubscription, reserveUsage, wouldExceed, createSubscription } = await import('../src/modules/billing/billing.service.js');
const { subscriptionAccess } = await import('../src/modules/billing/billing.policy.js');
const identity = { email: 'BitlanceAI@gmail.com', email_confirmed_at: '2026-01-01' };

test('only the confirmed exact mailbox matches', () => {
    assert.equal(matchesExemptIdentity(identity), true);
    assert.equal(matchesExemptIdentity({ ...identity, email_confirmed_at: null }), false);
    assert.equal(matchesExemptIdentity({ ...identity, email: 'other@gmail.com' }), false);
    assert.equal(matchesExemptIdentity({ email: 'other@gmail.com', user_metadata: identity }), false);
});
test('the identity must also have the server-side admin role', async () => {
    supabaseAdmin.auth.admin.getUserById = async () => ({ data: { user: identity } });
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role: 'user' } }) };
    supabaseAdmin.from = () => q;
    assert.equal(await isBillingExempt('admin-id'), false);
    q.maybeSingle = async () => ({ data: { role: 'admin' } });
    assert.equal(await isBillingExempt('admin-id'), true);
});
test('admin has active access without a subscription or quota reservation', async () => {
    supabaseAdmin.from = table => {
        assert.equal(table, 'users');
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role: 'admin' } }) };
        return q;
    };
    supabaseAdmin.rpc = async () => { throw new Error('Must not consume quota'); };
    const sub = await ensureSubscription('admin-id');
    assert.equal(subscriptionAccess(sub).active, true);
    assert.equal(subscriptionAccess(sub).mandateRequired, false);
    assert.equal(await reserveUsage('admin-id', null), null);
    assert.equal(await reserveUsage('admin-id', null, 'trial_auto_posts'), null);
    assert.equal(await wouldExceed('admin-id', 'workspaces', 100), false);
    await assert.rejects(createSubscription('admin-id', 'solo', 'monthly'), /does not need a subscription/);
});
test('identity lookup errors cannot grant the exemption', async () => {
    supabaseAdmin.auth.admin.getUserById = async () => ({ error: new Error('Identity lookup failed') });
    await assert.rejects(isBillingExempt('admin-id'), /Identity lookup failed/);
});
