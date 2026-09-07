import * as svc from './occasions.service.js';

const fail = (res, err, fallback) => {
    console.error('[occasions]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

const parseYear = (raw) => {
    const y = Number(raw || new Date().getFullYear());
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
};

/** GET /api/occasions/calendar?year=2026 — any signed-in user. */
export const getCalendar = async (req, res) => {
    try {
        const year = parseYear(req.query.year);
        if (!year) return res.status(400).json({ success: false, error: 'year must be between 2000 and 2100' });
        res.json({ success: true, ...(await svc.getCalendar(year)) });
    } catch (err) { fail(res, err, 'Failed to load the occasion calendar'); }
};

/** GET /api/occasions/between?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const getBetween = async (req, res) => {
    try {
        res.json({ success: true, occasions: await svc.listBetween(req.query.from, req.query.to) });
    } catch (err) { fail(res, err, 'Failed to load occasions'); }
};

// ── Admin handlers (mounted under /api/admin, behind requireAdmin) ──

/** GET /api/admin/occasions?year=2026 — same calendar, admin panel view. */
export const adminGetCalendar = getCalendar;

/** PUT /api/admin/occasions/:slug/:year  { date, name?, notes? } */
export const adminSetDate = async (req, res) => {
    try {
        const entry = await svc.setDate(
            req.params.slug, req.params.year, req.body || {}, req.user?.id || null,
        );
        res.json({ success: true, entry });
    } catch (err) { fail(res, err, 'Failed to save the occasion date'); }
};

/** DELETE /api/admin/occasions/:slug/:year */
export const adminRemoveDate = async (req, res) => {
    try {
        await svc.removeDate(req.params.slug, req.params.year);
        res.json({ success: true });
    } catch (err) { fail(res, err, 'Failed to remove the occasion date'); }
};
