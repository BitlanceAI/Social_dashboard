import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { subscriptionAccess, providerPatch, generationPeriod } from '../src/modules/billing/billing.policy.js';

const now = Date.parse('2026-09-19T12:00:00Z');
const future = '2026-10-04T12:00:00Z';
const trial = { id: 'row1', user_id: 'user1', plan_key: 'solo', interval: 'monthly', status: 'trialing',
    mandate_required: true, mandate_authorized_at: null, trial_ends_at: future, current_period_end: future };

test('trial is inaccessible until payment is authorized', () => {
    assert.equal(subscriptionAccess(trial, now).active, false);
    assert.equal(subscriptionAccess(trial, now).mandateRequired, true);
    assert.equal(subscriptionAccess({ ...trial, mandate_authorized_at: new Date(now).toISOString() }, now).active, true);
});
test('expired trials and overdue paid periods cannot publish', () => {
    assert.equal(subscriptionAccess({ ...trial, mandate_authorized_at: future }, Date.parse(future)).active, false);
    assert.equal(subscriptionAccess({ ...trial, status: 'active' }, Date.parse(future)).active, false);
});
test('existing trials do not acquire a retrospective mandate requirement', () => {
    assert.equal(subscriptionAccess({ ...trial, mandate_required: false }, now).active, true);
});
test('cancelling renewal retains paid access only through the period end', () => {
    assert.equal(subscriptionAccess({ ...trial, status: 'active', cancel_at_period_end: true }, now).active, true);
    assert.equal(subscriptionAccess({ ...trial, status: 'cancelled' }, now).active, false);
});
test('authentication grants trial access without marking the period paid', () => {
    const patch = providerPatch({ status: 'authenticated' }, trial, now);
    assert.equal(patch.status, 'trialing');
    assert.ok(patch.mandate_authorized_at);
    assert.equal(patch.current_period_start, undefined);
    assert.equal(providerPatch({ status: 'authenticated' }, { ...trial, status: 'cancelled' }, now).status, undefined);
});
test('provider renewals set the paid billing window and failures remove access', () => {
    const patch = providerPatch({ status: 'active', current_start: now / 1000, current_end: Date.parse(future) / 1000 }, trial, now);
    assert.equal(patch.current_period_end, future.replace('Z', '.000Z'));
    assert.equal(patch.status, 'active');
    assert.equal(providerPatch({ status: 'pending' }, trial, now).status, 'past_due');
});
test('annual payments still receive monthly generation allowances', () => {
    const paid = { ...trial, status: 'active', interval: 'yearly' };
    assert.notEqual(generationPeriod(paid, new Date(now)), generationPeriod(paid, new Date(future)));
    assert.notEqual(generationPeriod(trial, new Date(now)), generationPeriod(trial, new Date(future)));
});

// No live credentials, provider requests, or database writes are used by these tests.
process.env.SUPABASE_URL = 'https://billing-test.invalid';
process.env.SUPABASE_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RAZORPAY_KEY_ID = 'test-key';
process.env.RAZORPAY_KEY_SECRET = 'test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-test-secret';
const { supabaseAdmin } = await import('../src/config/supabase.js');
supabaseAdmin.auth.admin.getUserById = async () => ({ data: { user: { email: 'customer@example.test' } } });
const billing = await import('../src/modules/billing/billing.service.js');

function database(results) {
    const calls = [];
    supabaseAdmin.from = table => {
        const result = results.shift();
        assert.ok(result, `Unexpected database call: ${table}`);
        const query = {};
        for (const method of ['select', 'eq', 'is', 'update', 'insert', 'in', 'order']) {
            query[method] = (...args) => { calls.push({ table, method, args }); return query; };
        }
        query.single = query.maybeSingle = async () => result;
        query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        return query;
    };
    return calls;
}
const plan = { plan_key: 'solo', name: 'Solo', is_active: true, trial_days: 15, mandate_required: true,
    monthly_price: 30000, yearly_price: 300000, currency: 'INR', razorpay_plan_id_monthly: 'plan_month', razorpay_plan_id_yearly: 'plan_year' };

test('new monthly mandate starts charging after a 15-day trial', async () => {
    const calls = database([{ data: plan }, { data: { ...trial, trial_ends_at: null } }, { data: { id: 'row1' } }, { data: trial }]);
    let payload;
    global.fetch = async (url, options) => {
        if (url.endsWith('/plans/plan_month')) return { ok: true, json: async () => ({ item: { amount: 30000, currency: 'INR' }, period: 'monthly', interval: 1 }) };
        payload = JSON.parse(options.body);
        return { ok: true, json: async () => ({ id: 'sub_new' }) };
    };
    const before = Math.floor(Date.now() / 1000);
    await billing.createSubscription('user1', 'solo', 'monthly');
    assert.ok(payload.start_at >= before + 15 * 86400);
    assert.equal(payload.total_count, 120);
    const update = calls.find(c => c.method === 'update' && c.args[0].razorpay_subscription_id);
    assert.equal(update.args[0].status, 'trialing');
    assert.equal(update.args[0].mandate_authorized_at, null);
});
test('catalog / provider price mismatch fails before creating a subscription', async () => {
    database([{ data: plan }, { data: trial }]);
    global.fetch = async () => ({ ok: true, json: async () => ({ item: { amount: 50000, currency: 'INR' }, period: 'monthly', interval: 1 }) });
    await assert.rejects(billing.createSubscription('user1', 'solo', 'monthly'), /does not match/);
});
test('duplicate checkout resumes the same created subscription', async () => {
    database([{ data: plan }, { data: { ...trial, razorpay_subscription_id: 'sub_existing' } }]);
    let requests = 0;
    global.fetch = async () => { requests++; return { ok: true, json: async () => ({ id: 'sub_existing', status: 'created' }) }; };
    assert.equal((await billing.createSubscription('user1', 'solo', 'monthly')).subscriptionId, 'sub_existing');
    assert.equal(requests, 1);
});
test('an existing authorized mandate cannot be duplicated by changing interval', async () => {
    database([{ data: plan }, { data: { ...trial, razorpay_subscription_id: 'sub_existing' } }]);
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'authenticated' }) });
    await assert.rejects(billing.createSubscription('user1', 'solo', 'yearly'), /Cancel your existing/);
});
test('checkout verification rejects another account subscription', async () => {
    database([{ data: { ...trial, razorpay_subscription_id: 'sub_own' } }]);
    await assert.rejects(billing.verifySubscription('user1', { subscriptionId: 'sub_foreign' }), /does not belong/);
});
test('valid authorization signature does not prematurely activate a paid plan', async () => {
    const sub = { ...trial, trial_ends_at: new Date(Date.now() + 86400000).toISOString(), razorpay_subscription_id: 'sub_own' };
    const calls = database([{ data: sub }, { data: { ...sub, mandate_authorized_at: future } }]);
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'authenticated' }) });
    const signature = crypto.createHmac('sha256', 'test-secret').update('pay1|sub_own').digest('hex');
    const result = await billing.verifySubscription('user1', { paymentId: 'pay1', subscriptionId: 'sub_own', signature });
    assert.equal(result.trialActive, true);
    assert.equal(calls.find(c => c.method === 'update').args[0].status, 'trialing');
});
test('failed provider cancellation never reports local success', async () => {
    const calls = database([{ data: { ...trial, razorpay_subscription_id: 'sub_own' } }]);
    global.fetch = async (_url, options) => options.method === 'GET'
        ? { ok: true, json: async () => ({ status: 'authenticated' }) }
        : { ok: false, json: async () => ({ error: { description: 'Cancellation failed' } }) };
    await assert.rejects(billing.cancelSubscription('user1'), /Cancellation failed/);
    assert.equal(calls.some(c => c.method === 'update'), false);
});
test('invalid webhook signatures are rejected before database access', async () => {
    database([]);
    await assert.rejects(billing.handleWebhook(Buffer.from('{}'), 'invalid'), /Invalid webhook/);
});

test('a delayed failure webhook uses the current provider state', async () => {
    const calls = database([{ data: { ...trial, razorpay_subscription_id: 'sub_own' } }, { data: null }]);
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'active', current_end: Date.parse(future) / 1000 }) });
    const raw = Buffer.from(JSON.stringify({ event: 'subscription.pending', payload: { subscription: { entity: { id: 'sub_own', status: 'pending' } } } }));
    const signature = crypto.createHmac('sha256', 'webhook-test-secret').update(raw).digest('hex');
    await billing.handleWebhook(raw, signature);
    assert.equal(calls.find(c => c.method === 'update').args[0].status, 'active');
});

test('cancelling an authorized trial cancels immediately before the first charge', async () => {
    const calls = database([{ data: { ...trial, razorpay_subscription_id: 'sub_own' } }, { data: trial }]);
    let cancellation;
    global.fetch = async (_url, options) => {
        if (options.method === 'POST') cancellation = JSON.parse(options.body);
        return { ok: true, json: async () => ({ status: 'authenticated' }) };
    };
    await billing.cancelSubscription('user1');
    assert.equal(cancellation.cancel_at_cycle_end, 0);
    assert.equal(calls.find(c => c.method === 'update').args[0].status, 'cancelled');
});

test('failed AI generation returns its reserved allowance', async () => {
    database([{ data: { ...trial, trial_ends_at: new Date(Date.now() + 86400000).toISOString(), mandate_authorized_at: future } }, { data: { ...plan, generation_limit: 20 } }]);
    const rpcs = [];
    supabaseAdmin.rpc = async (name, args) => { rpcs.push({ name, args }); return { data: true }; };
    await assert.rejects(billing.withGenerationUsage('user1', null, async () => { throw new Error('AI unavailable'); }), /AI unavailable/);
    assert.deepEqual(rpcs.map(r => r.name), ['reserve_subscription_usage', 'release_subscription_usage']);
    assert.equal(rpcs[0].args.p_limit, 20);
    assert.equal(rpcs[1].args.p_period, rpcs[0].args.p_period);
});

test('an exhausted quota never calls the AI provider', async () => {
    database([{ data: { ...trial, trial_ends_at: new Date(Date.now() + 86400000).toISOString(), mandate_authorized_at: future } }, { data: { ...plan, generation_limit: 20 } }]);
    supabaseAdmin.rpc = async () => ({ data: false });
    let called = false;
    await assert.rejects(billing.withGenerationUsage('user1', null, async () => { called = true; }), /allowance is used up/);
    assert.equal(called, false);
});
