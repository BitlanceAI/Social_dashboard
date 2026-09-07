import * as svc from './ai.service.js';

const fail = (res, err, fallback) => {
    console.error('[ai]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

/** POST /api/ai/caption */
export const generateCaption = async (req, res) => {
    try {
        res.json({ success: true, ...(await svc.generateCaption(req.body || {})) });
    } catch (err) { fail(res, err, 'Failed to write the caption'); }
};

/** GET /api/ai/status — whether AI writing is available (for the UI to hide the button). */
export const status = async (_req, res) => {
    res.json({ success: true, configured: svc.isPerplexityConfigured() });
};
