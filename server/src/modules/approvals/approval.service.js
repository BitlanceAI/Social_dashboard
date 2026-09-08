/**
 * WhatsApp approval for scheduled posts.
 *
 * Lifecycle of a post scheduled with approver numbers:
 *
 *   pending_approval ──(Approve tap)──▶ pending | scheduled ──▶ published
 *                    └─(Reject tap)───▶ cancelled (+ optional reason)
 *
 * Every approver gets the interactive template plus a second message with
 * the full caption. Replying to either message with plain text edits the
 * caption before deciding. The first decision from any registered approver
 * wins, and the others are told so their buttons are stale.
 *
 * Reminders go out at most three times (1h, then 30m, then 10m after the
 * previous message) while a post is still waiting.
 *
 * The scheduler only publishes 'pending', so nothing here can be published
 * before it is approved.
 */

import '../../config/env.js';

import { supabaseAdmin } from '../../config/supabase.js';
import MetaService from '../meta/meta.service.js';
import { decryptData } from '../../shared/utils/encryption.js';
import { sendToWorkspace } from '../push/push.service.js';
import {
    isWhatsAppEnabled,
    cleanPhones,
    rowApproverPhones,
    sendApprovalTemplate,
    sendTextMessage,
} from '../whatsapp/whatsapp.service.js';

const db = () => {
    if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — approvals unavailable');
    return supabaseAdmin;
};

const CAPTION_HINT = '✏️ *To edit the caption, swipe right on this message and send the updated caption.*';

const formatWhen = (post) => {
    const when = new Date(post.scheduled_time);
    try {
        return when.toLocaleString('en-IN', {
            timeZone: post.timezone || 'UTC',
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        }) + (post.timezone ? ` (${post.timezone})` : '');
    } catch {
        return when.toISOString();
    }
};

const previewFor = (post) => {
    const clean = String(post.content || '').replace(/[\n\t\r]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return `New post for ${post.page_name || 'your page'} scheduled ${formatWhen(post)}: "${clean}"`;
};

const firstMedia = (post) => (Array.isArray(post.media_urls) && post.media_urls[0]) || null;

// ── Saved approvers ───────────────────────────────────────────────────────

export const getSavedApprovers = async (workspaceId) => {
    const { data, error } = await db()
        .from('approval_settings')
        .select('phones')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (error) throw error;
    return Array.isArray(data?.phones) ? data.phones : [];
};

export const setSavedApprovers = async (workspaceId, phones) => {
    const list = cleanPhones(phones);
    const { error } = await db()
        .from('approval_settings')
        .upsert({ workspace_id: workspaceId, phones: list, updated_at: new Date().toISOString() });
    if (error) throw error;
    return list;
};

/** Merge newly used numbers into the workspace's remembered list. Never throws. */
export const rememberApprovers = async (workspaceId, phones) => {
    try {
        const existing = await getSavedApprovers(workspaceId);
        const merged = [...new Set([...existing, ...cleanPhones(phones)])];
        if (merged.length !== existing.length) await setSavedApprovers(workspaceId, merged);
    } catch (err) {
        console.warn('[Approvals] Could not remember approver numbers:', err.message);
    }
};

// ── Sending ───────────────────────────────────────────────────────────────

/**
 * Send (or resend) the approval request to every approver on the row.
 *
 * The post counts as "sent" when at least one delivery worked. The first
 * successful template id and caption id are stored so replies can be matched
 * back to the post.
 *
 * @param {object} post   scheduled_posts row
 * @param {object} [opts]
 * @param {string} [opts.prefix]   text prepended to the preview (reminders)
 * @param {boolean} [opts.countReminder]  bump approval_reminders_sent
 */
export const requestApproval = async (post, opts = {}) => {
    const approvers = rowApproverPhones(post);
    if (!approvers.length) return { sent: false, error: 'No approver numbers on this post' };

    const preview = (opts.prefix || '') + previewFor(post);
    const mediaUrl = firstMedia(post);
    const captionText = `*Full Caption:*\n\n${post.content || '(no caption)'}\n\n${CAPTION_HINT}`;

    const results = [];
    let templateId = null;
    let captionId = null;

    for (const phone of approvers) {
        const r = await sendApprovalTemplate(phone, preview, post.id, mediaUrl)
            .catch((err) => ({ success: false, error: err.message }));
        results.push({ phone, ...r });
        if (!r.success) continue;
        if (!templateId) templateId = r.messageId || null;

        const t = await sendTextMessage(phone, captionText).catch(() => ({}));
        if (t?.success && !captionId) captionId = t.messageId || null;
    }

    const ok = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    if (failed.length) {
        console.warn(`[Approvals] Post ${post.id}: ${ok.length}/${results.length} approver(s) reached — failed: ${failed.map((r) => `${r.phone} (${r.error || 'send failed'})`).join('; ')}`);
    }
    if (!ok.length) {
        return { sent: false, error: results.map((r) => `${r.phone}: ${r.error || 'send failed'}`).join('; ') };
    }

    const patch = {
        approval_sent_at: post.approval_sent_at || new Date().toISOString(),
        last_approval_reminder_at: new Date().toISOString(),
        ...(templateId ? { whatsapp_message_id: templateId } : {}),
        ...(captionId ? { whatsapp_caption_message_id: captionId } : {}),
        ...(opts.countReminder ? { approval_reminders_sent: (post.approval_reminders_sent || 0) + 1 } : {}),
    };
    const { error } = await db().from('scheduled_posts').update(patch).eq('id', post.id);
    if (error) console.error('[Approvals] Could not record approval send:', error.message);

    return { sent: true, reached: ok.length, total: results.length, simulated: ok.every((r) => r.simulated) };
};

// ── Activation after approval ─────────────────────────────────────────────

/**
 * Hand a Facebook-only post to Meta natively when it is still inside Meta's
 * 10-minute-to-75-day window. Returns the Meta post id, or null when the
 * native path is not applicable or failed (the caller then falls back to our
 * own scheduler).
 */
const tryNativeMetaSchedule = async (post) => {
    if ((post.provider || 'meta') !== 'meta') return null;
    const platforms = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ['facebook'];
    if (!(platforms.includes('facebook') && !platforms.includes('instagram'))) return null;

    const ahead = new Date(post.scheduled_time).getTime() - Date.now();
    if (ahead < 10 * 60 * 1000 || ahead > 75 * 24 * 60 * 60 * 1000) return null;

    try {
        const { data: connection } = await db()
            .from('meta_connections')
            .select('access_token, is_active')
            .eq('id', post.meta_connection_id)
            .maybeSingle();
        if (!connection?.is_active) return null;

        const accessToken = decryptData(connection.access_token);
        if (!accessToken) return null;
        const metaService = new MetaService(accessToken);

        const tokenResult = await metaService.getPageToken(post.page_id);
        if (!tokenResult.success) return null;

        const sched = await metaService.schedulePost(post.page_id, tokenResult.pageAccessToken, {
            message: post.content,
            link: post.link_url,
            mediaUrls: post.media_urls || [],
            scheduledTime: post.scheduled_time,
        });
        if (!sched.success) {
            console.warn(`[Approvals] Native Meta schedule failed for ${post.id}: ${sched.error} — using server scheduler`);
            return null;
        }
        return sched.data.post_id || sched.data.id || null;
    } catch (err) {
        console.warn(`[Approvals] Native Meta schedule error for ${post.id}: ${err.message} — using server scheduler`);
        return null;
    }
};

/**
 * Move an approved row into a publishable state. Atomic on status so two
 * concurrent approvals (two approvers, or WhatsApp + dashboard) cannot both
 * win. Returns the updated row, or null if it was no longer pending approval.
 */
export const activateApprovedPost = async (post, { by = 'dashboard' } = {}) => {
    const metaPostId = await tryNativeMetaSchedule(post);

    const patch = {
        approved_by: by,
        approved_at: new Date().toISOString(),
        awaiting_rejection_feedback: false,
        ...(metaPostId
            ? {
                status: 'scheduled',
                meta_post_id: metaPostId,
                publish_results: { facebook: { scheduled: true, postId: metaPostId } },
            }
            : { status: 'pending' }),
    };

    const { data, error } = await db()
        .from('scheduled_posts')
        .update(patch)
        .eq('id', post.id)
        .eq('status', 'pending_approval')
        .select()
        .maybeSingle();
    if (error) throw error;

    if (!data && metaPostId) {
        // Someone else settled the row first; do not leave a stray post on Meta.
        console.warn(`[Approvals] Post ${post.id} settled concurrently — native schedule ${metaPostId} left on Meta, cancel it manually if needed`);
    }
    return data;
};

/** Cancel a row that is still awaiting approval. Returns the updated row or null. */
export const rejectPendingPost = async (post, { by = 'dashboard', awaitFeedback = false } = {}) => {
    const { data, error } = await db()
        .from('scheduled_posts')
        .update({
            status: 'cancelled',
            rejected_by: by,
            rejected_at: new Date().toISOString(),
            awaiting_rejection_feedback: awaitFeedback,
        })
        .eq('id', post.id)
        .eq('status', 'pending_approval')
        .select()
        .maybeSingle();
    if (error) throw error;
    return data;
};

// ── Inbound from WhatsApp ─────────────────────────────────────────────────

const notifyOthers = async (post, fromDigits, text) => {
    for (const phone of rowApproverPhones(post).filter((p) => p !== fromDigits)) {
        await sendTextMessage(phone, text).catch(() => {});
    }
};

/**
 * A quick-reply tap. `fromDigits` must be one of the post's approvers.
 */
export const decideFromWhatsApp = async (postId, fromDigits, approved) => {
    const { data: post, error } = await db()
        .from('scheduled_posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle();
    if (error) throw error;

    if (!post) {
        console.warn(`[Approvals] WhatsApp decision for unknown post ${postId}`);
        return;
    }
    if (post.status !== 'pending_approval') {
        console.log(`[Approvals] Post ${postId} already ${post.status} — ignoring ${approved ? 'approve' : 'reject'} from ${fromDigits}`);
        await sendTextMessage(fromDigits, `ℹ️ This post has already been settled (${post.status.replace('_', ' ')}). No action needed.`).catch(() => {});
        return;
    }

    const approvers = rowApproverPhones(post);
    if (approvers.length && !approvers.includes(fromDigits)) {
        console.warn(`[Approvals] Post ${postId}: reply from ${fromDigits} is not a registered approver — ignoring`);
        return;
    }

    if (approved) {
        const updated = await activateApprovedPost(post, { by: fromDigits });
        if (!updated) {
            console.warn(`[Approvals] Post ${postId} was settled by another request`);
            return;
        }
        console.log(`[Approvals] ✅ Post ${postId} approved by ${fromDigits} → ${updated.status}`);
        await sendTextMessage(fromDigits, '✅ Post approved! It will be published at the scheduled time.').catch(() => {});
        await notifyOthers(post, fromDigits, `✅ The scheduled post was approved by +${fromDigits} — no action needed.`);
        await sendToWorkspace(post.workspace_id, {
            title: 'Post approved on WhatsApp',
            body: `${post.page_name || 'Post'}: approved by +${fromDigits}.`,
            url: '/socialdashboad',
        }).catch(() => {});
        return;
    }

    const updated = await rejectPendingPost(post, { by: fromDigits, awaitFeedback: true });
    if (!updated) {
        console.warn(`[Approvals] Post ${postId} was settled by another request`);
        return;
    }
    console.log(`[Approvals] ❌ Post ${postId} rejected by ${fromDigits}`);

    const r = await sendTextMessage(
        fromDigits,
        '❌ Post rejected. It will not be published.\n\n📝 To help improve the next one, swipe right on this message and reply with the reason for rejection.',
    ).catch(() => ({}));
    // Replies to this message are matched back as rejection feedback.
    if (r?.success && r.messageId) {
        await db().from('scheduled_posts').update({ whatsapp_caption_message_id: r.messageId }).eq('id', postId);
    }
    await notifyOthers(post, fromDigits, `❌ The scheduled post was rejected by +${fromDigits} — no action needed.`);
    await sendToWorkspace(post.workspace_id, {
        title: 'Post rejected on WhatsApp',
        body: `${post.page_name || 'Post'}: rejected by +${fromDigits}.`,
        url: '/socialdashboad',
    }).catch(() => {});
};

// WhatsApp message ids contain '.', '=' and '+', which PostgREST's `or=()`
// filter grammar does not tolerate, so the two columns are queried separately.
const findByMessageId = async (messageId, extra = (q) => q) => {
    if (!messageId) return null;
    for (const column of ['whatsapp_message_id', 'whatsapp_caption_message_id']) {
        const { data, error } = await extra(
            db().from('scheduled_posts').select('*').eq(column, messageId),
        ).limit(1).maybeSingle();
        if (error) throw error;
        if (data) return data;
    }
    return null;
};

/**
 * Plain text from an approver. A reply (quoted message) to one of our
 * approval messages on a post still awaiting approval edits its caption;
 * otherwise, if that approver just rejected a post, the text is stored as
 * their rejection feedback. Returns true when the text was consumed.
 */
export const handleTextFromWhatsApp = async (fromDigits, contextId, text) => {
    if (!text) return false;

    // 1. Caption edit — only when explicitly replying to our message, so a
    //    stray "ok" never overwrites a caption.
    const editable = await findByMessageId(contextId, (q) => q.eq('status', 'pending_approval'));
    if (editable) {
        const approvers = rowApproverPhones(editable);
        if (approvers.length && !approvers.includes(fromDigits)) return false;

        const { error } = await db().from('scheduled_posts').update({ content: text }).eq('id', editable.id);
        if (error) throw error;
        console.log(`[Approvals] ✏️ Caption edited via WhatsApp for post ${editable.id} by ${fromDigits}`);

        await sendTextMessage(
            fromDigits,
            `✅ *Caption updated!*\n\nNew caption:\n\n"${text}"\n\nNow tap *Approve* or *Reject* on the post above to decide.`,
        ).catch(() => {});
        await sendToWorkspace(editable.workspace_id, {
            title: 'Caption edited on WhatsApp',
            body: `${editable.page_name || 'Post'}: +${fromDigits} changed the caption before approving.`,
            url: '/socialdashboad',
        }).catch(() => {});
        return true;
    }

    // 2. Rejection feedback — the reply to the rejection message, or failing
    //    that, this approver's most recent rejection in the last 48h.
    let rejected = await findByMessageId(contextId, (q) => q.eq('awaiting_rejection_feedback', true).eq('rejected_by', fromDigits));
    if (!rejected) {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data, error } = await db()
            .from('scheduled_posts')
            .select('*')
            .eq('awaiting_rejection_feedback', true)
            .eq('rejected_by', fromDigits)
            .gte('rejected_at', cutoff)
            .order('rejected_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        rejected = data;
    }
    if (!rejected) return false;

    const { error } = await db()
        .from('scheduled_posts')
        .update({ rejection_comment: text, awaiting_rejection_feedback: false })
        .eq('id', rejected.id);
    if (error) throw error;
    console.log(`[Approvals] 📝 Rejection feedback for post ${rejected.id} from ${fromDigits}`);

    await sendTextMessage(fromDigits, '📝 Got it — your feedback has been shared with the team.').catch(() => {});
    await sendToWorkspace(rejected.workspace_id, {
        title: 'Rejection feedback received',
        body: `+${fromDigits}: "${text.substring(0, 120)}"`,
        url: '/socialdashboad',
    }).catch(() => {});
    return true;
};

// ── Reminders ─────────────────────────────────────────────────────────────

const REMINDER_PREFIX = [
    '⏳ *Reminder:* You have a post waiting for your approval.\n\n',
    '⚠️ *Action required:* This post is still waiting for your approval.\n\n',
    '🚨 *Final notice:* Approve or reject this post now, or it will miss its slot.\n\n',
];
const REMINDER_GAP_MS = [60 * 60 * 1000, 30 * 60 * 1000, 10 * 60 * 1000];

/**
 * Called by the scheduler every tick. Sends up to three reminders per post,
 * each only after its gap since the previous message has passed.
 */
export const sendApprovalReminders = async () => {
    if (!isWhatsAppEnabled() || !supabaseAdmin) return;

    const { data: posts, error } = await supabaseAdmin
        .from('scheduled_posts')
        .select('*')
        .eq('status', 'pending_approval')
        .lt('approval_reminders_sent', REMINDER_PREFIX.length)
        .gt('scheduled_time', new Date().toISOString());
    if (error) {
        // Before the migration lands the columns do not exist; that is expected.
        if (!['42703', '42P01', 'PGRST204'].includes(error.code)) {
            console.error('[Approvals] Reminder sweep failed:', error.message);
        }
        return;
    }

    for (const post of posts || []) {
        const n = post.approval_reminders_sent || 0;
        const last = post.last_approval_reminder_at || post.approval_sent_at || post.created_at;
        if (!last) continue;
        if (Date.now() - new Date(last).getTime() < REMINDER_GAP_MS[n]) continue;
        if (!rowApproverPhones(post).length) continue;

        const r = await requestApproval(post, { prefix: REMINDER_PREFIX[n], countReminder: true })
            .catch((err) => ({ sent: false, error: err.message }));
        if (r.sent) console.log(`[Approvals] Reminder ${n + 1} sent for post ${post.id}`);
        else console.warn(`[Approvals] Reminder ${n + 1} failed for post ${post.id}: ${r.error}`);
    }
};

export default {
    getSavedApprovers,
    setSavedApprovers,
    rememberApprovers,
    requestApproval,
    activateApprovedPost,
    rejectPendingPost,
    decideFromWhatsApp,
    handleTextFromWhatsApp,
    sendApprovalReminders,
};
