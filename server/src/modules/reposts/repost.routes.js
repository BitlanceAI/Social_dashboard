import express from 'express';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceCapability } from '../../middleware/workspace.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { getWatch, listWatches, listPosts, saveWatch, runWatch, queuePost, retryMedia, pumpRepostApprovalQueue } from './repost.service.js';

const router = express.Router();
router.use(authenticateUser, resolveWorkspace);
const view = requireWorkspaceCapability('content.view');
const edit = requireWorkspaceCapability('content.edit');
const publish = requireWorkspaceCapability('content.publish');
const respond = (res, error) => res.status(error.status || (error.code === '23505' ? 409 : 500))
    .json({ error: error.code === '23505' ? 'This source is already watched in this workspace' : error.message });

router.get('/watches', view, async (req, res) => {
    try { res.json({ watches: await listWatches(req.workspaceId) }); }
    catch (error) { respond(res, error); }
});
router.post('/watches', edit, async (req, res) => {
    try {
        const watch = await saveWatch(req.workspaceId, req.user.id, req.body || {});
        if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
        res.status(201).json({ watch });
    }
    catch (error) { respond(res, error); }
});
router.put('/watches/:id', edit, async (req, res) => {
    try {
        const watch = await saveWatch(req.workspaceId, req.user.id, req.body || {}, req.params.id);
        if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
        res.json({ watch });
    }
    catch (error) { respond(res, error); }
});
router.delete('/watches/:id', edit, async (req, res) => {
    try {
        const { data: deleted, error } = await supabaseAdmin.rpc('delete_instagram_repost_watch', {
            p_watch_id: req.params.id, p_workspace_id: req.workspaceId,
        });
        if (error) throw error;
        if (!deleted) return res.status(404).json({ error: 'Watch not found' });
        res.json({ deleted: true });
    } catch (error) {
        if (error.code === 'P0001') error.status = 409;
        respond(res, error);
    }
});
router.patch('/watches/:id/active', edit, async (req, res) => {
    try {
        await getWatch(req.workspaceId, req.params.id);
        if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' });
        const { data, error } = await supabaseAdmin.from('instagram_repost_watches')
            .update({ active: req.body.active, updated_at: new Date().toISOString() })
            .eq('id', req.params.id).eq('workspace_id', req.workspaceId).select('*').single();
        if (error) throw error;
        if (data.active && data.mode === 'approval') await pumpRepostApprovalQueue(data);
        res.json({ watch: data });
    } catch (error) { respond(res, error); }
});
router.post('/watches/:id/run', publish, async (req, res) => {
    try { res.json(await runWatch(await getWatch(req.workspaceId, req.params.id), { force: true })); }
    catch (error) { respond(res, error); }
});
router.get('/watches/:id/posts', view, async (req, res) => {
    try {
        await getWatch(req.workspaceId, req.params.id);
        res.json({ posts: await listPosts(req.workspaceId, req.params.id) });
    } catch (error) { respond(res, error); }
});

const importedPost = async (workspaceId, id) => {
    const { data, error } = await supabaseAdmin.from('instagram_repost_posts').select('*')
        .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    if (!data) throw Object.assign(new Error('Imported post not found'), { status: 404 });
    return data;
};
const postDeliveries = async (workspaceId, postId) => {
    const { data, error } = await supabaseAdmin.from('scheduled_posts').select('id,status,page_name')
        .eq('workspace_id', workspaceId).eq('repost_source_post_id', postId);
    if (error) throw error;
    return data || [];
};
router.post('/posts/:id/queue', publish, async (req, res) => {
    try { res.json(await queuePost(req.workspaceId, req.params.id, { forceApproval: !!req.body?.approval })); }
    catch (error) { respond(res, error); }
});
router.post('/posts/:id/retry', publish, async (req, res) => {
    try {
        const post = await importedPost(req.workspaceId, req.params.id);
        if (post.state === 'media_failed') {
            const repaired = await retryMedia(req.workspaceId, post.id);
            const watch = await getWatch(req.workspaceId, post.watch_id);
            if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
            return res.json({ post: repaired });
        }
        const deliveries = await postDeliveries(req.workspaceId, post.id);
        const failed = deliveries.filter(d => d.status === 'failed');
        if (failed.length) {
            const { data, error } = await supabaseAdmin.from('scheduled_posts').update({ status: 'pending', error_message: null })
                .eq('workspace_id', req.workspaceId).in('id', failed.map(d => d.id)).eq('status', 'failed')
                .select('id,status');
            if (error) throw error;
            return res.json({ deliveries: data || [] });
        }
        if (deliveries.length) return res.status(409).json({ error: 'No failed delivery to retry' });
        res.json(await queuePost(req.workspaceId, post.id));
    } catch (error) { respond(res, error); }
});
router.post('/posts/:id/skip', edit, async (req, res) => {
    try {
        const post = await importedPost(req.workspaceId, req.params.id);
        if ((await postDeliveries(req.workspaceId, post.id)).length) return res.status(409).json({ error: 'Cancel the queued delivery instead' });
        const { data, error } = await supabaseAdmin.from('instagram_repost_posts')
            .update({ state: 'skipped', updated_at: new Date().toISOString() })
            .eq('id', post.id).eq('workspace_id', req.workspaceId).select('*').single();
        if (error) throw error;
        const watch = await getWatch(req.workspaceId, post.watch_id);
        if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
        res.json({ post: data });
    } catch (error) { respond(res, error); }
});
router.post('/posts/:id/cancel', publish, async (req, res) => {
    try {
        const post = await importedPost(req.workspaceId, req.params.id);
        const deliveries = await postDeliveries(req.workspaceId, post.id);
        if (!deliveries.length) return res.status(409).json({ error: 'No delivery to cancel' });
        if (deliveries.some(d => !['pending', 'pending_approval', 'failed', 'cancelled'].includes(d.status))) {
            return res.status(409).json({ error: 'A delivery is already publishing or published' });
        }
        const { data, error } = await supabaseAdmin.from('scheduled_posts').update({ status: 'cancelled' })
            .eq('workspace_id', req.workspaceId).eq('repost_source_post_id', post.id)
            .in('status', ['pending', 'pending_approval', 'failed']).select('id,status');
        if (error) throw error;
        const watch = await getWatch(req.workspaceId, post.watch_id);
        if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
        res.json({ deliveries: data || [] });
    } catch (error) { respond(res, error); }
});

export default router;
