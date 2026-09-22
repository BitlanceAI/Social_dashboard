import * as storageService from './storage.service.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { cleanPhones } from '../whatsapp/whatsapp.service.js';
import { rememberApprovers, requestApproval } from '../approvals/approval.service.js';

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

/**
 * POST /api/storage/quick-schedule
 *
 * Schedule a media-library file as a post directly from the library.
 * Body: { targetId, provider, platforms, mediaUrl, content, scheduledTime,
 *         approverPhones, timezone }
 *
 * Creates a scheduled_posts row with status pending_approval (if approvers given)
 * or pending (if no approvers), then fires the WhatsApp approval request.
 */
export const quickSchedule = async (req, res) => {
    try {
        const {
            targetId, provider = 'meta', platforms = ['facebook'],
            mediaUrl, content, scheduledTime,
            approverPhones = '', timezone,
        } = req.body || {};

        if (!targetId) return res.status(400).json({ success: false, error: 'targetId is required' });
        if (!scheduledTime) return res.status(400).json({ success: false, error: 'scheduledTime is required' });
        if (!content && !mediaUrl) return res.status(400).json({ success: false, error: 'Either content or mediaUrl is required' });

        const phones = cleanPhones(String(approverPhones || '').split(/[,;\s]+/));
        const hasApprovers = phones.length > 0;
        const parsedTime = new Date(scheduledTime);
        if (isNaN(parsedTime.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid scheduledTime' });
        }

        // Insert the post row
        const row = {
            workspace_id: req.workspaceId,
            user_id: req.user.id,
            page_id: targetId,
            page_name: targetId,   // will be resolved to name by the caller if desired
            provider,
            platforms: platforms,
            content: content || '',
            media_urls: mediaUrl ? [mediaUrl] : [],
            scheduled_time: parsedTime.toISOString(),
            timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            status: hasApprovers ? 'pending_approval' : 'pending',
            ...(phones.length ? { approver_phones: phones } : {}),
        };

        const { data: post, error: insertError } = await supabaseAdmin
            .from('scheduled_posts')
            .insert(row)
            .select('*')
            .single();
        if (insertError) throw insertError;

        // Save approver numbers to the workspace so they're pre-filled next time
        if (phones.length) {
            await rememberApprovers(req.workspaceId, phones);
        }

        let approval = null;
        if (hasApprovers) {
            approval = await requestApproval(post);
        }

        res.status(201).json({
            success: true,
            post,
            approval,
            message: hasApprovers
                ? (approval?.sent
                    ? 'Scheduled and approval request sent via WhatsApp.'
                    : 'Scheduled, but could not send WhatsApp approval request.')
                : 'Scheduled successfully.',
        });
    } catch (err) {
        fail(res, err, 'Failed to quick-schedule the post');
    }
};
