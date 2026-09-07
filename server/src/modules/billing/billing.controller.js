import * as billingService from './billing.service.js';

const fail = (res, err, fallback) => {
    console.error('[billing]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

/**
 * GET /api/billing/plans  (PUBLIC)
 * The tier catalog for the pricing page. No auth — display fields only.
 */
export const getPlans = async (req, res) => {
    try {
        res.json({ success: true, ...(await billingService.getPlans()) });
    } catch (err) {
        fail(res, err, 'Failed to load plans');
    }
};

/** GET /api/billing/me — the caller's plan, limits, usage, and trial status. */
export const getMe = async (req, res) => {
    try {
        res.json({ success: true, ...(await billingService.getEntitlement(req.user.id)) });
    } catch (err) {
        fail(res, err, 'Failed to load billing status');
    }
};

/** POST /api/billing/subscribe  { planKey, interval } */
export const subscribe = async (req, res) => {
    try {
        const { planKey, interval } = req.body || {};
        if (!planKey) return res.status(400).json({ success: false, error: 'planKey is required' });
        const chosen = interval === 'yearly' ? 'yearly' : 'monthly';
        res.status(201).json({ success: true, ...(await billingService.createSubscription(req.user.id, planKey, chosen)) });
    } catch (err) {
        fail(res, err, 'Failed to start the subscription');
    }
};

/** POST /api/billing/verify  { paymentId, subscriptionId, signature } */
export const verify = async (req, res) => {
    try {
        const { paymentId, subscriptionId, signature } = req.body || {};
        if (!paymentId || !subscriptionId || !signature) {
            return res.status(400).json({ success: false, error: 'paymentId, subscriptionId and signature are required' });
        }
        res.json({ success: true, ...(await billingService.verifySubscription(req.user.id, { paymentId, subscriptionId, signature })) });
    } catch (err) {
        fail(res, err, 'Failed to verify the payment');
    }
};

/** POST /api/billing/cancel */
export const cancel = async (req, res) => {
    try {
        res.json({ success: true, ...(await billingService.cancelSubscription(req.user.id)) });
    } catch (err) {
        fail(res, err, 'Failed to cancel the subscription');
    }
};

/** POST /api/billing/webhook  (PUBLIC, Razorpay) — raw body, signature-verified. */
export const webhook = async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        // app.js captures the raw request body for signature checks.
        const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
        const result = await billingService.handleWebhook(raw, signature);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[billing] webhook error:', err.message);
        res.status(err.status || 500).json({ success: false });
    }
};
