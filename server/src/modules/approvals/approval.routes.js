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
    setSavedApprovers,
    rememberApprovers,
    requestApproval,
    activateApprovedPost,
    rejectPendingPost,
} from './approval.service.js';

const router = express.Router();

router.use(authenticateUser);
router.use(resolveWorkspace);

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

router.get('/approvers', async (req, res) => {
    try {
        res.json({ success: true, enabled: isWhatsAppEnabled(), phones: await getSavedApprovers(req.workspaceId) });
    } catch (err) {
        console.error('Get approvers error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/approvers', async (req, res) => {
    try {
        const phones = await setSavedApprovers(req.workspaceId, req.body?.phones ?? req.body?.approverPhones ?? []);
        res.json({ success: true, phones });
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

        res.json({
            success: true,
            post: updated,
            message: updated.status === 'scheduled'
                ? 'Approved and handed to Facebook for publishing.'
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

        const updated = await rejectPendingPost(post, { by: `dashboard:${req.user.id}` });
        if (!updated) {
            return res.status(409).json({ error: 'This post was just settled by someone else. Reload to see its state.' });
        }
        const reason = String(req.body?.reason || '').trim();
        if (reason) {
            await supabaseAdmin.from('scheduled_posts').update({ rejection_comment: reason }).eq('id', post.id);
        }

        for (const phone of rowApproverPhones(post)) {
            await sendTextMessage(phone, '❌ The scheduled post was rejected from the dashboard — no action needed.').catch(() => {});
        }

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
