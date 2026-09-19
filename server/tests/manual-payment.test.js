import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManualPayment } from '../src/modules/admin/manual-payment.js';
import { subscriptionAccess, providerPatch } from '../src/modules/billing/billing.policy.js';

const now = Date.parse('2026-09-19T12:00:00Z');
const payment = { requestId: '00000000-0000-0000-0000-000000000001', amount: 30000, reference: ' UPI-123 ', paidUntil: '2026-10-19T12:00:00Z' };
test('manual payment validates amount, expiry and audit reference', () => {
    assert.equal(validateManualPayment(payment, now).p_reference, 'UPI-123');
    for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: 1.5 }, { reference: ' ' }, { requestId: 'bad' }, { paidUntil: 'invalid' }, { paidUntil: '2026-09-18' }, { paidUntil: '2040-01-01' }]) {
        assert.throws(() => validateManualPayment({ ...payment, ...patch }, now), { status: 400 });
    }
});
test('manual payment unlocks an account without pretending to authorize a mandate', () => {
    const sub = { status: 'trialing', mandate_required: true, manual_paid_until: payment.paidUntil };
    const access = subscriptionAccess(sub, now);
    assert.equal(access.active, true);
    assert.equal(access.manualPaid, true);
    assert.equal(access.mandateRequired, false);
    assert.equal(access.trialActive, false);
    assert.equal(sub.mandate_authorized_at, undefined);
});
test('manual access expires at the exact paid-through time', () => {
    const sub = { status: 'past_due', mandate_required: true, manual_paid_until: payment.paidUntil };
    assert.equal(subscriptionAccess(sub, Date.parse(payment.paidUntil)).active, false);
});
test('provider cancellation cannot erase a separately recorded manual payment', () => {
    const sub = { status: 'active', manual_paid_until: payment.paidUntil };
    const updated = { ...sub, ...providerPatch({ status: 'cancelled' }, sub, now) };
    assert.equal(subscriptionAccess(updated, now).active, true);
    assert.equal(updated.manual_paid_until, payment.paidUntil);
});
