/**
 * WhatsApp routes.
 *
 *   GET  /api/whatsapp/webhook   Meta's one-time subscription handshake
 *   POST /api/whatsapp/webhook   inbound messages + delivery statuses
 *   GET  /api/whatsapp/status    (auth) is the approval channel configured?
 *
 * The webhook is called by Meta, so it carries no Bearer token; it is
 * authenticated by the X-Hub-Signature-256 HMAC over the raw body instead
 * (app.js keeps `req.rawBody` for exactly this). Point the WhatsApp product's
 * webhook in the Meta app dashboard at `${PUBLIC_URL}/api/whatsapp/webhook`
 * and subscribe to the `messages` field.
 */

import '../../config/env.js';

import express from 'express';
import { verifyWhatsAppSignature } from './whatsapp.signature.js';
import { authenticateUser } from '../../middleware/auth.js';
import { isWhatsAppEnabled, APPROVE_PREFIX, REJECT_PREFIX } from './whatsapp.service.js';
import { decideFromWhatsApp, handleTextFromWhatsApp } from '../approvals/approval.service.js';

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;

// Known delivery-failure codes → plain-English hints for the logs. Delivery
// receipts are the ONLY place Meta says why an accepted message never arrived.
const WA_ERROR_HINTS = {
    131053: 'media upload error — Meta could not fetch the header media (video >16MB, wrong codec, or unreachable URL)',
    131026: 'undeliverable — recipient may not be on WhatsApp, or blocked the business',
    131047: 'outside the 24h customer-service window — a template message is required',
    131049: 'delivery limited by Meta (per-user marketing limits)',
    132001: 'template does not exist (or is not approved) for this WABA/language',
    132012: 'template parameter mismatch — header type or variable count differs from the approved template',
    132018: 'template parameter contains newlines/tabs or 4+ consecutive spaces',
};

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
        console.log('[WhatsApp] Webhook verified');
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
    // Meta needs a fast 200 or it retries; everything below is best-effort.
    res.sendStatus(200);

    const verification = verifyWhatsAppSignature(req);
    if (!verification.valid) {
        console.warn(`[WhatsApp] Rejected webhook: ${verification.reason}`);
        return;
    }
    if (verification.warning) console.warn(`[WhatsApp] ${verification.warning}`);

    try {
        console.log(`[WhatsApp] Authenticated webhook received — entries=${req.body?.entry?.length || 0}`);
        for (const entry of req.body?.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field !== 'messages') continue;
                const value = change.value || {};
                console.log(`[WhatsApp] Message event — phone_id=${value.metadata?.phone_number_id || 'unknown'} messages=${value.messages?.length || 0} statuses=${value.statuses?.length || 0}`);

                for (const st of value.statuses || []) {
                    console.log(`[WhatsApp] Delivery status — status=${st.status} id=${st.id}`);
                    if (st.status === 'failed') {
                        console.error(`[WhatsApp] ✗ delivery FAILED id=${st.id} to=${st.recipient_id} errors=${JSON.stringify(st.errors || [])}`);
                        for (const e of st.errors || []) {
                            if (WA_ERROR_HINTS[e.code]) console.error(`[WhatsApp]    hint (${e.code}): ${WA_ERROR_HINTS[e.code]}`);
                        }
                    }
                }

                for (const message of value.messages || []) {
                    await handleInbound(message);
                }
            }
        }
    } catch (err) {
        console.error('[WhatsApp] Webhook processing error:', err.message);
    }
});

const handleInbound = async (message) => {
    const fromDigits = String(message.from || '').replace(/\D/g, '');
    if (!fromDigits) return;

    console.log(`[WhatsApp] Incoming — type=${message.type} from=${fromDigits} id=${message.id}`);

    if (message.type === 'button') {
        const payload = String(message.button?.payload || '');
        if (payload.startsWith(APPROVE_PREFIX) || payload.startsWith(REJECT_PREFIX)) {
            const approved = payload.startsWith(APPROVE_PREFIX);
            const postId = payload.slice(approved ? APPROVE_PREFIX.length : REJECT_PREFIX.length);
            await decideFromWhatsApp(postId, fromDigits, approved);
        } else {
            console.log(`[WhatsApp] Ignoring unknown button payload "${payload}"`);
        }
        return;
    }

    // Quick replies arrive as `button`, but some clients send an
    // `interactive.button_reply` — accept both.
    if (message.type === 'interactive' && message.interactive?.button_reply?.id) {
        const id = String(message.interactive.button_reply.id);
        if (id.startsWith(APPROVE_PREFIX) || id.startsWith(REJECT_PREFIX)) {
            const approved = id.startsWith(APPROVE_PREFIX);
            await decideFromWhatsApp(id.slice(approved ? APPROVE_PREFIX.length : REJECT_PREFIX.length), fromDigits, approved);
        }
        return;
    }

    if (message.type === 'text') {
        const text = String(message.text?.body || '').trim();
        const consumed = await handleTextFromWhatsApp(fromDigits, message.context?.id, text);
        if (!consumed) console.log(`[WhatsApp] Text from ${fromDigits} did not match a pending post — ignored`);
        return;
    }

    console.log(`[WhatsApp] Ignoring unsupported message type '${message.type}'`);
};

router.get('/status', authenticateUser, (req, res) => {
    res.json({ success: true, enabled: isWhatsAppEnabled() });
});

export default router;
