/**
 * WhatsApp Cloud API — outbound messages for the post-approval flow.
 *
 * WhatsApp is a system-level channel: one business number, configured by env,
 * deliberately independent of any user's Meta social connection. Without
 * WHATSAPP_GLOBAL_TOKEN + WHATSAPP_PHONE_ID the feature hides itself and every
 * send is a no-op that reports `simulated: true`.
 *
 * Two message shapes are used:
 *   - the Meta-approved `post_approval_utility` template (image header, one
 *     body variable, Approve/Reject quick-reply buttons). Quick-reply payloads
 *     are per-message, so `SCHED_APPROVE_<id>` / `SCHED_REJECT_<id>` tell the
 *     webhook which post a tap belongs to. `post_approval_utility_video` is the
 *     same template with a VIDEO header — Meta headers are typed, so an image
 *     template cannot carry a video.
 *   - free-form text, allowed only inside the 24h window that the template
 *     reply opens. Used for the full caption, confirmations and reminders.
 */

import '../../config/env.js';

import axios from 'axios';

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export const APPROVE_PREFIX = 'SCHED_APPROVE_';
export const REJECT_PREFIX = 'SCHED_REJECT_';

const IMAGE_TEMPLATE = process.env.WHATSAPP_APPROVAL_TEMPLATE || 'post_approval_utility';
const VIDEO_TEMPLATE = process.env.WHATSAPP_APPROVAL_VIDEO_TEMPLATE || 'post_approval_utility_video';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

const credentials = () => ({
    accessToken: process.env.WHATSAPP_GLOBAL_TOKEN || null,
    phoneId: process.env.WHATSAPP_PHONE_ID || null,
});

/** True when both the token and the sending phone id are configured. */
export const isWhatsAppEnabled = () => {
    const { accessToken, phoneId } = credentials();
    return Boolean(accessToken && phoneId);
};

// ── Phone helpers ─────────────────────────────────────────────────────────

/** Normalize a WhatsApp number: 10-digit Indian → 91-prefixed, else strip non-digits. */
export const cleanPhone = (p) => {
    const digits = String(p || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 7 || digits.length > 15) return null;
    return digits.length === 10 ? `91${digits}` : digits;
};

/**
 * Multi-approver input: an array of numbers, or one string with numbers
 * separated by commas/semicolons/whitespace. Returns normalized, deduped digits.
 */
export const cleanPhones = (input) => {
    if (input === undefined || input === null) return [];
    const parts = Array.isArray(input) ? input : String(input).split(/[,;\s]+/);
    return [...new Set(parts.map(cleanPhone).filter(Boolean))];
};

/** Approver numbers on a scheduled_posts row, normalized and deduped. */
export const rowApproverPhones = (row) => {
    const raw = Array.isArray(row?.approver_phones) ? row.approver_phones : [];
    return [...new Set(raw.map((p) => String(p || '').replace(/\D/g, '')).filter(Boolean))];
};

const isVideoUrl = (url) =>
    typeof url === 'string' && /\.(mp4|mov|webm|m4v|3gpp?)([?#]|$)/i.test(url.split('?')[0]);

const post = async (payload) => {
    const { accessToken, phoneId } = credentials();
    const response = await axios.post(
        `${META_API_BASE}/${phoneId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
    );
    return response.data?.messages?.[0]?.id || null;
};

const describeError = (error) => {
    const errData = error.response?.data?.error;
    return {
        message: errData?.message || error.message,
        code: errData?.code ?? null,
        subcode: errData?.error_subcode ?? null,
    };
};

// ── Sends ─────────────────────────────────────────────────────────────────

/**
 * Send the approval template to one number.
 *
 * @param {string} to           digits only (country code first)
 * @param {string} preview      one-line summary; sanitized + truncated for Meta
 * @param {string} postId       scheduled_posts.id, embedded in the button payloads
 * @param {string|null} mediaUrl public image/video URL for the header
 * @returns {{success: boolean, messageId?: string, simulated?: boolean, error?: string, errorCode?: number}}
 */
export const sendApprovalTemplate = async (to, preview, postId, mediaUrl) => {
    if (!isWhatsAppEnabled()) {
        console.warn(`[WhatsApp] Approval NOT sent (simulated) — WhatsApp is not configured. to=${to} post=${postId}`);
        return { success: true, simulated: true, messageId: `wamid_SIM_${Date.now()}` };
    }

    const formattedPhone = String(to).replace(/\D/g, '');
    let isVideo = isVideoUrl(mediaUrl);

    // Meta accepts a video template send and only fetches the media afterwards:
    // an oversized (>16MB) or non-MP4 video "sends" fine but never arrives
    // (delivery error 131053). Pre-flight the link and fall back to the image
    // template with a placeholder instead of silently losing the message.
    if (isVideo) {
        try {
            const head = await axios.head(mediaUrl, { timeout: 8000, maxRedirects: 3 });
            const size = Number(head.headers['content-length'] || 0);
            const ctype = String(head.headers['content-type'] || '').split(';')[0].trim();
            if (size > 16 * 1024 * 1024 || (ctype.startsWith('video/') && !['video/mp4', 'video/3gpp'].includes(ctype))) {
                console.warn(`[WhatsApp] Video not deliverable on WhatsApp (${size} bytes, ${ctype}) — using image template with placeholder`);
                isVideo = false;
                mediaUrl = null;
            }
        } catch (err) {
            console.warn(`[WhatsApp] Video pre-flight skipped (${err.message}) — sending anyway`);
        }
    }

    // Meta rejects template params containing newlines/tabs or 4+ consecutive
    // spaces (error 132018); captions routinely have both.
    const sanitized = String(preview || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim() || '(no caption)';
    const truncated = sanitized.length > 100 ? `${sanitized.substring(0, 97)}...` : sanitized;

    // Both templates require a media header. The image one falls back to a
    // configured placeholder for text-only posts.
    const placeholder = process.env.WHATSAPP_PLACEHOLDER_IMAGE_URL || null;
    if (!isVideo && !mediaUrl && !placeholder) {
        return {
            success: false,
            error: 'This post has no image and WHATSAPP_PLACEHOLDER_IMAGE_URL is not set, so the approval template has no header image.',
        };
    }

    const headerParam = isVideo
        ? { type: 'video', video: { link: mediaUrl } }
        : { type: 'image', image: { link: mediaUrl || placeholder } };

    const templateName = isVideo ? VIDEO_TEMPLATE : IMAGE_TEMPLATE;

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
            name: templateName, // UTILITY category — exempt from per-user marketing limits
            language: { code: TEMPLATE_LANG },
            components: [
                { type: 'header', parameters: [headerParam] },
                { type: 'body', parameters: [{ type: 'text', text: truncated }] },
                {
                    type: 'button', sub_type: 'quick_reply', index: 0,
                    parameters: [{ type: 'payload', payload: `${APPROVE_PREFIX}${postId}` }],
                },
                {
                    type: 'button', sub_type: 'quick_reply', index: 1,
                    parameters: [{ type: 'payload', payload: `${REJECT_PREFIX}${postId}` }],
                },
            ],
        },
    };

    try {
        const messageId = await post(payload);
        console.log(`[WhatsApp] ✅ Approval template accepted — to=${formattedPhone} post=${postId} template=${templateName} id=${messageId}`);
        return { success: true, messageId };
    } catch (error) {
        const e = describeError(error);
        console.error(`[WhatsApp] ❌ Approval template failed — to=${formattedPhone} post=${postId} code=${e.code ?? 'n/a'} subcode=${e.subcode ?? 'n/a'}: ${e.message}`);
        return { success: false, error: e.message, errorCode: e.code };
    }
};

/**
 * Free-form text. Only deliverable inside the 24h customer-service window,
 * which the approver's template reply (or any message from them) opens.
 */
export const sendTextMessage = async (to, text) => {
    if (!isWhatsAppEnabled()) {
        console.warn(`[WhatsApp] Text NOT sent (simulated) — to=${to}: "${String(text).substring(0, 60)}"`);
        return { success: true, simulated: true, messageId: `wamid_SIM_${Date.now()}` };
    }

    const formattedPhone = String(to).replace(/\D/g, '');
    try {
        const messageId = await post({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedPhone,
            type: 'text',
            text: { preview_url: false, body: text },
        });
        return { success: true, messageId };
    } catch (error) {
        const e = describeError(error);
        console.error(`[WhatsApp] ❌ Text failed — to=${formattedPhone} code=${e.code ?? 'n/a'}: ${e.message}`);
        return { success: false, error: e.message, errorCode: e.code };
    }
};

export default {
    isWhatsAppEnabled,
    cleanPhone,
    cleanPhones,
    rowApproverPhones,
    sendApprovalTemplate,
    sendTextMessage,
    APPROVE_PREFIX,
    REJECT_PREFIX,
};
