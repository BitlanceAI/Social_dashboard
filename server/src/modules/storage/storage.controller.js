import * as storageService from './storage.service.js';

const fail = (res, err, fallback) => {
    console.error('[storage]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

/**
 * GET /api/storage/config
 * What the buy form needs: price, currency, delete policy, and whether
 * payments are configured at all (the UI hides checkout when they are not).
 */
export const getConfig = async (req, res) => {
    try {
        const settings = await storageService.getSettings();
        res.json({
            success: true,
            pricePerGbMonth: settings.price_per_gb_month,
            currency: settings.currency,
            deleteAfterDays: settings.delete_after_days,
            paymentsEnabled: storageService.isConfigured(),
        });
    } catch (err) {
        fail(res, err, 'Failed to load storage config');
    }
};

/** GET /api/storage/me — the caller's entitlement and purchase history. */
export const getMe = async (req, res) => {
    try {
        res.json({ success: true, ...(await storageService.getEntitlement(req.user.id)) });
    } catch (err) {
        fail(res, err, 'Failed to load storage status');
    }
};

/** POST /api/storage/orders  { gb, months } — creates a Razorpay order. */
export const createOrder = async (req, res) => {
    try {
        const gb = parseInt(req.body?.gb, 10);
        const months = parseInt(req.body?.months, 10);
        if (!Number.isInteger(gb) || gb < 1 || gb > 1000) {
            return res.status(400).json({ success: false, error: 'gb must be between 1 and 1000' });
        }
        if (!Number.isInteger(months) || months < 1 || months > 24) {
            return res.status(400).json({ success: false, error: 'months must be between 1 and 24' });
        }
        res.status(201).json({ success: true, order: await storageService.createOrder(req.user.id, gb, months) });
    } catch (err) {
        fail(res, err, 'Failed to create the order');
    }
};

/** GET /api/storage/media — the caller's library, newest first. */
export const listMedia = async (req, res) => {
    try {
        // req.workspaceId comes from the x-workspace-id header (auth middleware);
        // it scopes the library so nothing leaks between workspaces.
        res.json({ success: true, media: await storageService.listMedia(req.user.id, req.workspaceId) });
    } catch (err) {
        fail(res, err, 'Failed to load your library');
    }
};

/** POST /api/storage/media — multipart upload into the library (quota-enforced). */
export const uploadMedia = async (req, res) => {
    try {
        if (!req.files?.length) {
            return res.status(400).json({ success: false, error: 'No files provided' });
        }
        res.status(201).json({ success: true, media: await storageService.uploadMedia(req.user.id, req.files, req.workspaceId) });
    } catch (err) {
        fail(res, err, 'Failed to upload');
    }
};

/** DELETE /api/storage/media/:id */
export const deleteMedia = async (req, res) => {
    try {
        await storageService.deleteMedia(req.user.id, req.params.id);
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Failed to delete the file');
    }
};

/**
 * POST /api/storage/verify  { orderId, paymentId, signature }
 * Called by the checkout success handler; activates the purchase.
 */
export const verifyPayment = async (req, res) => {
    try {
        const { orderId, paymentId, signature } = req.body || {};
        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({ success: false, error: 'orderId, paymentId and signature are required' });
        }
        const result = await storageService.verifyPayment(req.user.id, { orderId, paymentId, signature });
        res.json({ success: true, ...result });
    } catch (err) {
        fail(res, err, 'Failed to verify the payment');
    }
};
