import '../../config/env.js';
import express from 'express';
import { supabaseAdmin as db } from '../../config/supabase.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceRole } from '../../middleware/workspace.js';
import { decryptData } from '../../shared/utils/encryption.js';
import MetaService from '../meta/meta.service.js';
import { instagramClient } from '../instagram/instagram.connection.js';
import { canReply, normalizeEvent, verifySignature } from './messaging.policy.js';

export const messagingWebhook = express.Router();
export const instagramMessagingWebhook = express.Router();
export const messagingRouter = express.Router();
const enabled = () => process.env.META_MESSAGING_ENABLED === 'true';
const fail = (status, message) => Object.assign(new Error(message), { status });
const value = async query => { const { data, error } = await query; if (error) throw error; return data; };
const route = fn => async (req, res) => {
    try { await fn(req, res); } catch (error) {
        // Never log provider request objects: they contain tokens and message bodies.
        const migrationMissing = ['42P01', 'PGRST205', 'PGRST202'].includes(error.code);
        res.status(error.status || 503).json({ error: migrationMissing
            ? 'Messaging storage is not installed. Ask your administrator to apply the messaging migration.'
            : error.status ? error.message : 'Messaging is temporarily unavailable. Please retry.' });
    }
};

const verifyWebhook = (req, res, token) => {
    if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) {
        return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] || ''));
    }
    return res.sendStatus(403);
};
messagingWebhook.get('/', (req, res) => verifyWebhook(req, res, process.env.META_WEBHOOK_VERIFY_TOKEN));
instagramMessagingWebhook.get('/', (req, res) => verifyWebhook(req, res,
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN));

async function ingestWebhook(body, connectionType) {
    const provider = body.object === 'page' ? 'facebook' : body.object === 'instagram' ? 'instagram' : null;
    if (!provider) return;
    for (const entry of body.entry || []) {
        const query = connectionType === 'meta' ? db.from('social_message_accounts')
            .select('*,meta_connections!inner(is_active,selected_page_ids)')
            .eq('connection_type', 'meta').eq('provider', provider).eq('account_id', String(entry.id))
            .eq('meta_connections.is_active', true) : db.from('social_message_accounts')
            .select('*,instagram_connections!inner(is_active,instagram_user_id)')
            .eq('connection_type', 'instagram_login').eq('provider', 'instagram')
            .eq('account_id', String(entry.id)).eq('instagram_connections.is_active', true);
        const accounts = await value(query);
        for (const account of accounts || []) {
            if (connectionType === 'meta' &&
                !(account.meta_connections.selected_page_ids || []).map(String).includes(account.page_id)) continue;
            if (connectionType === 'instagram_login' &&
                account.instagram_connections.instagram_user_id !== account.account_id) continue;
            for (const event of entry.messaging || []) {
                const item = normalizeEvent(provider, entry.id, event);
                if (!item) continue;
                if (item.kind === 'receipt') {
                    await value(db.rpc('social_message_receipt', { p_account: account.id, p_participant: item.participant,
                        p_time: item.time, p_seen: item.seen }));
                } else {
                    await value(db.rpc('ingest_social_message', { p_account: account.id, p_participant: item.participant,
                        p_mid: item.mid, p_direction: item.direction, p_text: item.text,
                        p_attachments: item.attachments, p_time: item.time }));
                }
            }
        }
    }
}

messagingWebhook.post('/', route(async (req, res) => {
    if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
        return res.sendStatus(403);
    }
    if (!enabled()) return res.sendStatus(503);
    // Only database operations here; Meta gets a non-200 on failure and retries.
    await ingestWebhook(req.body, 'meta');
    res.sendStatus(200);
}));

instagramMessagingWebhook.post('/', route(async (req, res) => {
    if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), process.env.INSTAGRAM_APP_SECRET)) {
        return res.sendStatus(403);
    }
    if (!enabled()) return res.sendStatus(503);
    await ingestWebhook(req.body, 'instagram_login');
    return res.sendStatus(200);
}));

messagingRouter.use(authenticateUser, resolveWorkspace, requireWorkspaceRole('owner', 'admin', 'member'));
messagingRouter.use((req, res, next) => enabled() ? next() : res.status(503).json({
    error: 'Messaging has not been enabled by your administrator yet.' }));

async function connectionFor(workspaceId) {
    const connection = await value(db.from('meta_connections').select('*')
        .eq('workspace_id', workspaceId).eq('is_active', true).maybeSingle());
    if (!connection) throw fail(409, 'Connect Facebook and select your Pages first.');
    return connection;
}

async function accountToken(account, workspaceId) {
    if (account.connection_type === 'instagram_login') {
        const connection = await value(db.from('instagram_connections').select('*')
            .eq('id', account.instagram_connection_id).eq('workspace_id', workspaceId)
            .eq('is_active', true).maybeSingle());
        if (!connection || String(connection.instagram_user_id) !== account.account_id) {
            throw fail(403, 'This Instagram Login account is no longer connected in this workspace.');
        }
        try { return await instagramClient(db, connection); }
        catch { throw fail(409, 'Reconnect Instagram to restore messaging access.'); }
    }
    const connection = await connectionFor(workspaceId);
    if (connection.id !== account.connection_id || !(connection.selected_page_ids || []).map(String).includes(account.page_id)) {
        throw fail(403, 'This account is no longer selected in this workspace.');
    }
    const service = new MetaService(decryptData(connection.access_token));
    const result = await service.getPageToken(account.page_id);
    if (!result.success) throw fail(409, 'Reconnect Meta to restore messaging access.');
    if (account.provider === 'instagram' && String(result.page?.instagram_business_account?.id) !== account.account_id) {
        throw fail(403, 'The Instagram account is no longer linked to this Page.');
    }
    return new MetaService(result.pageAccessToken);
}

async function threadFor(id, workspaceId) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw fail(404, 'Conversation not found.');
    const thread = await value(db.from('social_conversations').select('*,social_message_accounts!inner(*)')
        .eq('id', id).eq('social_message_accounts.workspace_id', workspaceId).maybeSingle());
    if (!thread) throw fail(404, 'Conversation not found.');
    return thread;
}

messagingRouter.get('/accounts', route(async (req, res) => {
    const accounts = await value(db.from('social_message_accounts').select('id,provider,name,account_id')
        .eq('workspace_id', req.workspaceId));
    res.json({ accounts });
}));

// Explicit setup is retryable and does not prevent publishing OAuth from succeeding.
messagingRouter.post('/subscribe', requireWorkspaceRole('owner', 'admin'), route(async (req, res) => {
    const outcomes = [];
    const connection = await value(db.from('meta_connections').select('*')
        .eq('workspace_id', req.workspaceId).eq('is_active', true).maybeSingle());
    if (connection) {
        const service = new MetaService(decryptData(connection.access_token));
        const result = await service.getPages();
        if (!result.success) outcomes.push({ name: 'Facebook Pages', provider: 'facebook',
            source: 'Facebook Login', success: false, error: 'Reconnect Meta and grant messaging permissions.' });
        const selected = (connection.selected_page_ids || []).map(String);
        for (const page of result.success ? result.pages || [] : []) {
            if (!selected.includes(String(page.id)) || !page.access_token) continue;
            const api = new MetaService(page.access_token);
            const targets = [{ provider: 'facebook', account_id: String(page.id), name: page.name }];
            if (page.instagram_business_account?.id) targets.push({ provider: 'instagram',
                account_id: String(page.instagram_business_account.id), name: page.instagram_business_account.username || page.name });
            const existing = await api.request('GET', `/${page.id}/subscribed_apps`);
            if (!existing.success) {
                outcomes.push({ name: page.name, provider: 'facebook', source: 'Facebook Login', success: false,
                    error: 'Reconnect Meta with pages_manage_metadata to read Page subscriptions.' });
                continue;
            }
            const current = (existing.data?.data || []).find(a => String(a.id) === process.env.META_APP_ID);
            const fields = [...new Set([...(current?.subscribed_fields || []), 'messages', 'message_deliveries', 'message_reads'])].join(',');
            const subscribed = await api.request('POST', `/${page.id}/subscribed_apps`, { subscribed_fields: fields });
            for (const target of targets) {
                if (!subscribed.success) {
                    outcomes.push({ name: target.name, provider: target.provider, source: 'Facebook Login', success: false,
                        error: 'Meta declined the subscription. Check messaging permissions and webhook configuration, then reconnect.' });
                    continue;
                }
                await value(db.from('social_message_accounts').upsert({ ...target, workspace_id: req.workspaceId,
                    connection_id: connection.id, page_id: String(page.id), connection_type: 'meta' },
                { onConflict: 'workspace_id,provider,account_id,connection_type' }));
                outcomes.push({ name: target.name, provider: target.provider, source: 'Facebook Login', success: true });
            }
        }
    }
    const direct = await value(db.from('instagram_connections').select('*')
        .eq('workspace_id', req.workspaceId).eq('is_active', true).maybeSingle());
    if (direct) {
        let api;
        try { api = await instagramClient(db, direct); }
        catch { outcomes.push({ name: direct.username, provider: 'instagram', source: 'Instagram Login', success: false,
            error: 'Reconnect Instagram and grant instagram_business_manage_messages.' }); }
        const subscribed = api ? await api.request('POST', `/${direct.instagram_user_id}/subscribed_apps`,
            {}, { subscribed_fields: 'messages' }) : null;
        if (subscribed && !subscribed.success) {
            outcomes.push({ name: direct.username, provider: 'instagram', source: 'Instagram Login', success: false,
                error: subscribed.error });
        } else if (subscribed?.success) {
            await value(db.from('social_message_accounts').upsert({ workspace_id: req.workspaceId,
                instagram_connection_id: direct.id, connection_id: null, connection_type: 'instagram_login',
                provider: 'instagram', account_id: String(direct.instagram_user_id),
                page_id: String(direct.instagram_user_id), name: direct.username },
            { onConflict: 'workspace_id,provider,account_id,connection_type' }));
            outcomes.push({ name: direct.username, provider: 'instagram', source: 'Instagram Login', success: true });
        }
    }
    res.json({ outcomes });
}));

messagingRouter.get('/conversations', route(async (req, res) => {
    let query = db.from('social_conversations').select('*,social_message_accounts!inner(id,provider,name,workspace_id,connection_type)')
        .eq('social_message_accounts.workspace_id', req.workspaceId).order('last_message_at', { ascending: false }).order('id');
    const offset = Math.max(0, Math.min(10000, Number.parseInt(req.query.offset, 10) || 0));
    if (['facebook', 'instagram'].includes(req.query.provider)) query = query.eq('social_message_accounts.provider', req.query.provider);
    const rows = await value(query.range(offset, offset + 49));
    res.json({ conversations: rows.map(t => ({ ...t, canReply: canReply(t.last_inbound_at),
        unread: !!t.last_inbound_at && (!t.read_at || t.last_inbound_at > t.read_at) })), nextOffset: rows.length === 50 ? offset + 50 : null });
}));

messagingRouter.get('/conversations/:id/messages', route(async (req, res) => {
    const thread = await threadFor(req.params.id, req.workspaceId);
    const offset = Math.max(0, Math.min(10000, Number.parseInt(req.query.offset, 10) || 0));
    const messages = await value(db.from('social_messages').select('*').eq('conversation_id', thread.id).neq('status', 'sent_marker')
        .order('sent_at', { ascending: false }).order('id').range(offset, offset + 49));
    res.json({ messages: messages.reverse().map(m => ({ ...m, status: m.direction !== 'outbound' || m.status !== 'sent' ? m.status
        : thread.seen_at >= m.sent_at ? 'seen' : thread.delivered_at >= m.sent_at ? 'delivered' : 'sent' })),
        canReply: canReply(thread.last_inbound_at), nextOffset: messages.length === 50 ? offset + 50 : null });
}));

messagingRouter.post('/conversations/:id/read', route(async (req, res) => {
    const thread = await threadFor(req.params.id, req.workspaceId);
    // Mark only the inbound timestamp seen by this request; concurrent arrivals stay unread.
    await value(db.from('social_conversations').update({ read_at: thread.last_inbound_at }).eq('id', thread.id));
    res.json({ success: true });
}));

messagingRouter.post('/conversations/:id/reply', route(async (req, res) => {
    const thread = await threadFor(req.params.id, req.workspaceId);
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const requestId = req.body.requestId;
    if (!text || text.length > 1000 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId || '')) {
        throw fail(400, 'A message of 1–1000 characters and a valid request ID are required.');
    }
    const prior = await value(db.from('social_messages').select('status').eq('conversation_id', thread.id).eq('request_id', requestId).maybeSingle());
    if (prior) return res.json({ success: ['sent', 'sent_marker'].includes(prior.status), status: prior.status });
    if (!canReply(thread.last_inbound_at)) throw fail(409, 'The 24-hour reply window has closed. Wait for another message from this person.');
    const api = await accountToken(thread.social_message_accounts, req.workspaceId);
    const now = new Date().toISOString();
    const { data: pending, error } = await db.from('social_messages').insert({ conversation_id: thread.id,
        request_id: requestId, direction: 'outbound', text, sent_at: now, status: 'sending' }).select('id').single();
    if (error?.code === '23505') throw fail(409, 'This reply is already being processed. Refresh the thread.');
    if (error) throw error;
    const account = thread.social_message_accounts;
    const sent = await api.request('POST', `/${account.connection_type === 'instagram_login'
        ? account.account_id : account.page_id}/messages`, {
        recipient: { id: thread.participant_id }, message: { text },
        ...(account.provider === 'facebook' ? { messaging_type: 'RESPONSE' } : {}),
    });
    if (!sent.success || !sent.data?.message_id) {
        // A transport timeout may follow a successful send. Never automatically retry.
        const status = sent.code ? 'failed' : 'unknown';
        await value(db.from('social_messages').update({ status }).eq('id', pending.id));
        throw fail(409, status === 'unknown' ? 'Delivery could not be confirmed. Check the thread before sending again.'
            : 'Meta rejected this reply. Check the reply window and reconnect if permissions changed.');
    }
    // Echo can arrive before the send response. Both paths use the same unique MID.
    await value(db.rpc('ingest_social_message', { p_account: account.id, p_participant: thread.participant_id,
        p_mid: sent.data.message_id, p_direction: 'outbound', p_text: text, p_attachments: [], p_time: now }));
    // Retain the request ID as a deduplication marker, hidden from the conversation.
    await value(db.from('social_messages').update({ status: 'sent_marker' }).eq('id', pending.id));
    res.json({ success: true, status: 'sent' });
}));
