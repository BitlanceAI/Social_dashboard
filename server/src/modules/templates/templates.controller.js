import * as svc from './templates.service.js';

const fail = (res, err, fallback) => {
    console.error('[templates]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

/** GET /api/templates?niche=&search=  — public gallery listing. */
export const list = async (req, res) => {
    try {
        res.json({ success: true, templates: await svc.listTemplates({ niche: req.query.niche, search: req.query.search }) });
    } catch (err) { fail(res, err, 'Failed to load templates'); }
};

/** GET /api/templates/niches */
export const niches = async (req, res) => {
    try {
        res.json({ success: true, niches: await svc.listNiches() });
    } catch (err) { fail(res, err, 'Failed to load niches'); }
};

/** GET /api/templates/:key */
export const getOne = async (req, res) => {
    try {
        const t = await svc.getTemplateByKey(req.params.key);
        res.json({ success: true, template: { ...t, dynamicFields: t.dynamic_fields } });
    } catch (err) { fail(res, err, 'Failed to load the template'); }
};

// ── Admin ────────────────────────────────────────────────────────────────────

export const adminList = async (req, res) => {
    try { res.json({ success: true, templates: await svc.listAllTemplates() }); }
    catch (err) { fail(res, err, 'Failed to load templates'); }
};

export const adminCreate = async (req, res) => {
    try { res.status(201).json({ success: true, template: await svc.createTemplate(req.body || {}) }); }
    catch (err) { fail(res, err, 'Failed to create the template'); }
};

export const adminUpdate = async (req, res) => {
    try { res.json({ success: true, template: await svc.updateTemplate(req.params.key, req.body || {}) }); }
    catch (err) { fail(res, err, 'Failed to update the template'); }
};

export const adminDelete = async (req, res) => {
    try { await svc.deleteTemplate(req.params.key); res.json({ success: true }); }
    catch (err) { fail(res, err, 'Failed to delete the template'); }
};
