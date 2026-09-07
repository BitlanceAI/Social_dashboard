import * as svc from './design.service.js';

const fail = (res, err, fallback) => {
    console.error('[design]', fallback, err);
    res.status(err.status || 500).json({ success: false, error: err.status ? err.message : fallback });
};

/** POST /api/design/generate-from-template */
export const generateFromTemplate = async (req, res) => {
    try {
        const { templateKey } = req.body || {};
        if (!templateKey) return res.status(400).json({ success: false, error: 'templateKey is required' });
        res.json({ success: true, ...(await svc.generateFromTemplate(req.user.id, req.body || {}, req.workspaceId)) });
    } catch (err) { fail(res, err, 'Failed to generate the design'); }
};

/** GET /api/design/jobs */
export const listJobs = async (req, res) => {
    try { res.json({ success: true, jobs: await svc.listJobs(req.user.id) }); }
    catch (err) { fail(res, err, 'Failed to load jobs'); }
};

/** GET /api/design/jobs/:id */
export const getJob = async (req, res) => {
    try { res.json({ success: true, job: await svc.getJob(req.user.id, req.params.id) }); }
    catch (err) { fail(res, err, 'Failed to load the job'); }
};
