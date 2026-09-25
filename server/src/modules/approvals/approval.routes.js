/**
 * Dashboard side of post approvals (provider-neutral).
 *
 *   GET  /api/approvals/approvers        remembered approver numbers for the workspace
 *   PUT  /api/approvals/approvers        replace that list
 *   POST /api/approvals/:id/approve      approve from the dashboard (bypasses WhatsApp)
 *   POST /api/approvals/:id/reject       reject from the dashboard
 *   POST /api/approvals/:id/resend       resend the WhatsApp request (optionally new numbers)
 *
 * The WhatsApp webhook that receives the Approve/Reject taps lives in
 * modules/whatsapp.
 */

import '../../config/env.js';

import express from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { cleanPhones, isWhatsAppEnabled, sendTextMessage, rowApproverPhones } from '../whatsapp/whatsapp.service.js';
import {
    getSavedApprovers,
    getDefaultApprovers,
    setSavedApprovers,
    rememberApprovers,
    requestApproval,
    activateApprovedPost,
    rejectPendingPost,
    advanceRepostQueue,
} from './approval.service.js';

import { loadApprovalQueue, parseQueuePage } from './approval.store.js';
import { loadRejectedPost, generateRevision, resubmitRevision } from './revision.service.js';

const router = express.Router();

router.use(authenticateUser);
router.use(resolveWorkspace);

router.post('/:id/revise', async (req, res) => {
    try {
        const post = await loadRejectedPost(req.params.id, req.workspaceId);
        res.json({ success: true, ...await generateRevision(post, req.user.id) });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not generate a revision.' });
    }
});

router.post('/:id/resubmit', async (req, res) => {
    try {
        const post = await loadRejectedPost(req.params.id, req.workspaceId);
        res.json(await resubmitRevision(post, req.body || {}));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not resubmit the revision.' });
    }
});

const loadPendingPost = async (req, res) => {
    const { data: post, error } = await supabaseAdmin
        .from('scheduled_posts')
        .select('*')
        .eq('id', req.params.id)
        .eq('workspace_id', req.workspaceId)
        .maybeSingle();
    if (error) throw error;
    if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return null;
    }
    if (post.status !== 'pending_approval') {
        res.status(409).json({ error: `This post is ${post.status.replace('_', ' ')}, not awaiting approval.` });
        return null;
    }
    return post;
};

router.get('/pending', async (req, res) => {
    const pendingPage = parseQueuePage(req.query.pendingPage);
    const approvedPage = parseQueuePage(req.query.approvedPage);
    const rejectedPage = parseQueuePage(req.query.rejectedPage);
    if (pendingPage === null || approvedPage === null || rejectedPage === null) {
        return res.status(400).json({ error: 'Pages must be positive integers (maximum 100000).' });
    }
    try {
        res.json(await loadApprovalQueue(supabaseAdmin, req.workspaceId, pendingPage, approvedPage, rejectedPage));
    } catch (err) {
        console.error('Load approval queue error:', err);
        res.status(500).json({ error: 'Could not load approval queue.' });
    }
});

router.get('/approvers', async (req, res) => {
    try {
        res.json({ success: true, enabled: isWhatsAppEnabled(), phones: await getSavedApprovers(req.workspaceId), defaultPhones: await getDefaultApprovers(req.workspaceId) });
    } catch (err) {
        console.error('Get approvers error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/approvers', async (req, res) => {
    try {
        if (req.body?.defaultPhones !== undefined) {
            const input = req.body.defaultPhones;
            if (typeof input !== 'string' && !Array.isArray(input)) {
                return res.status(400).json({ error: 'Approval numbers must be a comma-separated list.' });
            }
            const parts = (Array.isArray(input) ? input : input.split(/[,;\s]+/)).filter(Boolean);
            if (parts.some(phone => !cleanPhones([phone]).length)) {
                return res.status(400).json({ error: 'Enter valid WhatsApp numbers with country codes, or 10-digit Indian numbers.' });
            }
        }
        const phones = await setSavedApprovers(req.workspaceId, req.body?.phones ?? req.body?.approverPhones ?? [], req.body?.defaultPhones);
        res.json({ success: true, phones, defaultPhones: await getDefaultApprovers(req.workspaceId) });
    } catch (err) {
        console.error('Set approvers error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/approve', async (req, res) => {
    try {
        const post = await loadPendingPost(req, res);
        if (!post) return;

        const updated = await activateApprovedPost(post, { by: `dashboard:${req.user.id}` });
        if (!updated) {
            return res.status(409).json({ error: 'This post was just settled by someone else. Reload to see its state.' });
        }

        for (const phone of rowApproverPhones(post)) {
            await sendTextMessage(phone, '✅ The scheduled post was approved from the dashboard — no action needed.').catch(() => {});
        }

        await advanceRepostQueue(updated);

        res.json({
            success: true,
            post: updated,
            message: new Date(updated.scheduled_time).getTime() <= Date.now()
                ? 'Approved. It will publish on the next scheduler run.'
                : 'Approved. It will publish at the scheduled time.',
        });
    } catch (err) {
        console.error('Approve post error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/reject', async (req, res) => {
    try {
        const post = await loadPendingPost(req, res);
        if (!post) return;

        const updated = await rejectPendingPost(post, { by: `dashboard:${req.user.id}`, reason: req.body?.reason || '' });
        if (!updated) {
            return res.status(409).json({ error: 'This post was just settled by someone else. Reload to see its state.' });
        }
        for (const phone of rowApproverPhones(post)) {
            await sendTextMessage(phone, '❌ The scheduled post was rejected from the dashboard — no action needed.').catch(() => {});
        }

        await advanceRepostQueue(updated);

        res.json({ success: true, post: updated, message: 'Post rejected.' });
    } catch (err) {
        console.error('Reject post error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/resend', async (req, res) => {
    try {
        if (!isWhatsAppEnabled()) {
            return res.status(503).json({ error: 'WhatsApp approvals are not configured on this server.' });
        }
        let post = await loadPendingPost(req, res);
        if (!post) return;

        // A resend may also replace the approver list.
        const input = req.body?.approverPhones ?? req.body?.approverPhone;
        if (input !== undefined) {
            const list = cleanPhones(input);
            if (list.length) {
                const { data, error } = await supabaseAdmin
                    .from('scheduled_posts')
                    .update({ approver_phones: list })
                    .eq('id', post.id)
                    .select()
                    .single();
                if (error) throw error;
                post = data;
                await rememberApprovers(req.workspaceId, list);
            }
        }

        if (!rowApproverPhones(post).length) {
            return res.status(400).json({ error: 'No approver phone number on this post. Add one and try again.' });
        }

        const result = await requestApproval(post);
        if (!result.sent) {
            return res.status(502).json({ error: `Could not send the WhatsApp request: ${result.error}` });
        }
        res.json({ success: true, message: `Approval request sent to ${result.reached} approver${result.reached === 1 ? '' : 's'}.` });
    } catch (err) {
        console.error('Resend approval error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
