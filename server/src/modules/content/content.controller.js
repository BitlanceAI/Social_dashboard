import {
    addComment, createContent, createVersion, listContent, loadContent,
    scheduleApprovedContent, transitionContent,
} from './content.service.js';

const send = (handler) => async (req, res) => {
    try {
        const result = await handler(req);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[Content portal]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Content operation failed' });
    }
};

export const list = send(async (req) => listContent(req.workspaceId, req.query, req.workspace.role));
export const getOne = send(async (req) => ({ item: await loadContent(req.workspaceId, req.params.id, req.workspace.role) }));
export const create = send(async (req) => ({ item: await createContent(req.workspaceId, req.user.id, req.body || {}) }));
export const version = send(async (req) => ({ version: await createVersion(req.workspaceId, req.params.id, req.user.id, req.workspace.role, req.body || {}) }));
export const comment = send(async (req) => ({ comment: await addComment(req.workspaceId, req.params.id, req.user.id, req.workspace.role, req.body || {}) }));
export const transition = (action) => send(async (req) => ({ item: await transitionContent(req.workspaceId, req.params.id, req.user.id, req.workspace.role, action, req.body?.reason) }));
export const schedule = send(async (req) => scheduleApprovedContent(req.workspaceId, req.params.id, req.user.id, req.workspace.role));

