import { env } from '../../config/env.js';
import crypto from 'node:crypto';
import express from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { encryptData } from '../../shared/utils/encryption.js';
import { postMediaUpload, uploadPostMedia } from '../../shared/storage/postMedia.js';
import { billingOwner, getEntitlement, dailyPostCapExceeded } from '../billing/billing.service.js';
import { cleanPhones, isWhatsAppEnabled } from '../whatsapp/whatsapp.service.js';
import { rememberApprovers, requestApproval } from '../approvals/approval.service.js';
import InstagramService, { instagramTargetId } from './instagram.service.js';
import { instagramClient } from './instagram.connection.js';

const redirectUri = () => process.env.INSTAGRAM_REDIRECT_URI || `${env.publicUrl}/api/instagram/oauth/callback`;
const returnUrl = (params) => `${env.frontendUrl}/socialdashboad?${new URLSearchParams(params)}`;
export const hashOAuthValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const opaque = () => crypto.randomBytes(32).toString('hex');
const validOpaque = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const expires = () => new Date(Date.now() + 15 * 60000).toISOString();
const fail = (res, error) => {
    if (['42P01', 'PGRST205', 'PGRST200', '42703'].includes(error?.code)) {
        return res.status(503).json({ code: 'INSTAGRAM_MIGRATION_REQUIRED',
            error: 'Instagram setup is incomplete. Apply database migration 20260922120000_instagram_login.sql, then try again.' });
    }
    return res.status(error?.code === '23514' ? 402 : 500).json({
    error: error?.code === '23514' ? 'Your plan social account limit is reached.' : 'Instagram request could not be completed. Please retry.',
    });
};
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => fail(res, error));

export function validateInstagramPost(body, scheduled = false) {
    if (!Array.isArray(body.platforms) || body.platforms.length !== 1 || body.platforms[0] !== 'instagram') return 'Select Instagram only.';
    if (typeof body.content !== 'string' || body.content.length > 2200) return 'Instagram captions must be at most 2,200 characters.';
    if (!Array.isArray(body.mediaUrls) || body.mediaUrls.length < 1 || body.mediaUrls.length > 10
        || body.mediaUrls.some((url) => typeof url !== 'string' || !/^https?:\/\//i.test(url))) return 'Choose 1–10 publicly accessible images or videos.';
    if (scheduled && (!Number.isFinite(Date.parse(body.scheduledTime)) || Date.parse(body.scheduledTime) <= Date.now())) return 'Choose a future publishing time.';
    return null;
}

export function createInstagramRouter({ db = supabaseAdmin, auth = authenticateUser, workspace = resolveWorkspace,
    Service = InstagramService, clientFor = instagramClient } = {}) {
const router = express.Router();

// Callback stores a short-lived encrypted handoff, never credentials in a URL.
router.get('/oauth/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    try {
        if (!validOpaque(req.query.state)) throw new Error('Invalid state');
        const { data: pending, error } = await db.from('instagram_oauth_states').delete()
            .eq('state_hash', hashOAuthValue(req.query.state)).eq('phase', 'authorize')
            .gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
        if (error || !pending) throw new Error('Expired state');
        if (req.query.error) return res.redirect(returnUrl({ error: 'Instagram authorization was cancelled or denied.' }));
        if (typeof req.query.code !== 'string' || !req.query.code) throw new Error('No code');
        const tokens = await Service.exchangeCode(req.query.code, process.env.INSTAGRAM_APP_ID,
            process.env.INSTAGRAM_APP_SECRET, redirectUri());
        const profile = await new Service(tokens.accessToken).getProfile();
        if (!profile.success || !profile.data.user_id || !profile.data.username) throw new Error('No Instagram profile');
        if (!['BUSINESS', 'MEDIA_CREATOR'].includes(profile.data.account_type)) throw new Error('Professional account required');
        const ticket = opaque();
        const { error: saved } = await db.from('instagram_oauth_states').insert({
            ...pending, state_hash: hashOAuthValue(ticket), phase: 'complete', expires_at: expires(),
            credentials: { instagram_user_id: String(profile.data.user_id), username: profile.data.username,
                avatar_url: profile.data.profile_picture_url || null, access_token: encryptData(tokens.accessToken),
                token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString() },
        });
        if (saved) throw saved;
        res.redirect(returnUrl({ instagram_ticket: ticket }));
    } catch {
        res.redirect(returnUrl({ error: 'Instagram connection failed. Try again with a Business or Creator account.' }));
    }
});

router.post(['/deauthorize', '/data-deletion'], express.urlencoded({ extended: false }), wrap(async (req, res) => {
    const secret = process.env.INSTAGRAM_APP_SECRET;
    const parts = typeof req.body.signed_request === 'string' ? req.body.signed_request.split('.') : [];
    if (!secret || parts.length !== 2) return res.status(400).json({ error: 'Invalid signed request.' });
    const signature = Buffer.from(parts[0], 'base64url');
    const expected = crypto.createHmac('sha256', secret).update(parts[1]).digest();
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
        return res.status(400).json({ error: 'Invalid signed request.' });
    }
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { /* invalid JSON */ }
    if (payload?.algorithm !== 'HMAC-SHA256' || !payload.user_id) return res.status(400).json({ error: 'Invalid signed request.' });
    const { error } = await db.from('instagram_connections').delete().eq('instagram_user_id', String(payload.user_id));
    if (error) throw error;
    // Remove any outstanding completed handoffs for this account as well.
    const { error: pendingError } = await db.from('instagram_oauth_states').delete()
        .eq('credentials->>instagram_user_id', String(payload.user_id));
    if (pendingError) throw pendingError;
    const code = crypto.createHmac('sha256', secret).update(String(payload.user_id)).digest('hex').slice(0, 24);
    return res.json(req.path === '/data-deletion'
        ? { url: `${env.frontendUrl}/data-deletion?confirmation_code=${code}`, confirmation_code: code }
        : { success: true });
}));

router.use(auth, workspace);

router.post('/oauth/url', wrap(async (req, res) => {
    const missing = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'].filter((key) => !process.env[key]?.trim());
    if (missing.length) {
        return res.status(503).json({ code: 'INSTAGRAM_NOT_CONFIGURED', missing,
            error: `Instagram Login is missing ${missing.join(' and ')} on the backend. Add the credentials from Meta → Instagram → API setup with Instagram login, then restart the backend.` });
    }
    if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY || '')) {
        return res.status(503).json({ code: 'INSTAGRAM_ENCRYPTION_NOT_CONFIGURED',
            error: 'The backend ENCRYPTION_KEY must be a valid 64-character hexadecimal key. Preserve the existing key used for connected accounts.' });
    }
    if (!validOpaque(req.body.verifier)) return res.status(400).json({ error: 'Invalid login request.' });
    const state = opaque();
    await db.from('instagram_oauth_states').delete().lt('expires_at', new Date().toISOString());
    const { error } = await db.from('instagram_oauth_states').insert({
        state_hash: hashOAuthValue(state), user_id: req.user.id, workspace_id: req.workspaceId,
        verifier_hash: hashOAuthValue(req.body.verifier), phase: 'authorize', expires_at: expires(),
    });
    if (error) throw error;
    res.set('Cache-Control', 'no-store').json({ success: true,
        url: Service.getOAuthUrl(process.env.INSTAGRAM_APP_ID, redirectUri(), state) });
}));

router.post('/oauth/complete', wrap(async (req, res) => {
    if (!validOpaque(req.body.ticket) || !validOpaque(req.body.verifier)) {
        return res.status(400).json({ error: 'Invalid Instagram login. Please connect again.' });
    }
    const { data: pending, error } = await db.from('instagram_oauth_states').delete()
        .eq('state_hash', hashOAuthValue(req.body.ticket)).eq('verifier_hash', hashOAuthValue(req.body.verifier))
        .eq('user_id', req.user.id).eq('workspace_id', req.workspaceId).eq('phase', 'complete')
        .gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (error) throw error;
    if (!pending?.credentials) return res.status(400).json({ error: 'Instagram login expired or belongs to another session. Connect again.' });
    // A different account must not silently inherit an existing account's queue.
    const { data: existing, error: lookupError } = await db.from('instagram_connections')
        .select('instagram_user_id').eq('workspace_id', req.workspaceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.instagram_user_id !== pending.credentials.instagram_user_id) {
        return res.status(409).json({ error: 'Disconnect the existing Instagram account before connecting a different one.' });
    }
    const { error: saved } = await db.from('instagram_connections').upsert({
        ...pending.credentials, workspace_id: req.workspaceId, user_id: req.user.id,
        is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });
    if (saved) throw saved;
    res.json({ success: true });
}));

const load = async (req, res) => {
    const { data, error } = await db.from('instagram_connections').select('*')
        .eq('workspace_id', req.workspaceId).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'No Instagram account connected.' }); return null; }
    try { return { connection: data, service: await clientFor(db, data) }; }
    catch { res.status(401).json({ error: 'Instagram connection unavailable. Please reconnect.', code: 'TOKEN_EXPIRED' }); return null; }
};
const apiResult = async (req, res, result) => {
    if (result.success) return res.json(result);
    if (result.code === 190 || result.status === 401) {
        await db.from('instagram_connections').update({ is_active: false }).eq('workspace_id', req.workspaceId);
        return res.status(401).json({ error: 'Instagram session expired. Please reconnect.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(400).json({ error: result.error });
};

router.get('/connection', wrap(async (req, res) => {
    const { data: c, error } = await db.from('instagram_connections')
        .select('instagram_user_id,username,avatar_url,token_expires_at,is_active').eq('workspace_id', req.workspaceId).maybeSingle();
    if (error && ['42P01', 'PGRST205'].includes(error.code)) return res.json({ connected: false });
    if (error) throw error;
    if (!c) return res.json({ connected: false });
    res.json({ connected: true, isValid: c.is_active && new Date(c.token_expires_at).getTime() > Date.now(),
        expiresAt: c.token_expires_at, account: { id: instagramTargetId(c.instagram_user_id),
            username: c.username, avatarUrl: c.avatar_url } });
}));
router.delete('/disconnect', wrap(async (req, res) => {
    const { error: pendingError } = await db.from('instagram_oauth_states').delete().eq('workspace_id', req.workspaceId);
    if (pendingError) throw pendingError;
    const { error } = await db.from('instagram_connections').delete().eq('workspace_id', req.workspaceId);
    if (error) throw error;
    res.json({ success: true });
}));
router.post('/refresh-accounts', wrap(async (req, res) => {
    const ctx = await load(req, res); if (!ctx) return;
    const profile = await ctx.service.getProfile();
    if (!profile.success) return apiResult(req, res, profile);
    const { error } = await db.from('instagram_connections').update({ username: profile.data.username,
        avatar_url: profile.data.profile_picture_url || null }).eq('id', ctx.connection.id);
    if (error) throw error;
    res.json({ success: true });
}));
router.get('/posts/history', wrap(async (req, res) => {
    const ctx = await load(req, res); if (!ctx) return;
    return apiResult(req, res, await ctx.service.getFeed(ctx.connection.instagram_user_id, ctx.connection.username));
}));
router.get('/insights', wrap(async (req, res) => {
    const ctx = await load(req, res); if (!ctx) return;
    return apiResult(req, res, await ctx.service.getAccountInsights(ctx.connection.instagram_user_id));
}));
router.get('/posts/:mediaId/comments', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.mediaId)) return res.status(400).json({ error: 'Invalid Instagram media ID.' });
    const ctx = await load(req, res); if (!ctx) return;
    return apiResult(req, res, await ctx.service.getComments(req.params.mediaId));
}));
router.post('/comments/:commentId/reply', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.commentId)) return res.status(400).json({ error: 'Invalid Instagram comment ID.' });
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 1000) return res.status(400).json({ error: 'Reply must be 1–1,000 characters.' });
    const ctx = await load(req, res); if (!ctx) return;
    return apiResult(req, res, await ctx.service.replyToComment(req.params.commentId, message));
}));
router.post('/posts/upload-media', postMediaUpload.array('files'), wrap(async (req, res) => {
    const result = await uploadPostMedia(req.user.id, req.files || [], req.workspaceId);
    res.status(result.success ? 200 : 400).json(result);
}));

for (const scheduled of [false, true]) {
    router.post(scheduled ? '/posts/schedule' : '/posts/publish', wrap(async (req, res) => {
        const problem = validateInstagramPost(req.body, scheduled);
        if (problem) return res.status(400).json({ error: problem });
        const ctx = await load(req, res); if (!ctx) return;
        const c = ctx.connection;
        if (req.body.pageId !== instagramTargetId(c.instagram_user_id)) return res.status(403).json({ error: 'This Instagram account is not connected in this workspace.' });
        const owner = await billingOwner(req.user.id, req.workspaceId);
        if (!(await getEntitlement(owner)).active) return res.status(402).json({ error: 'Subscribe to resume publishing.', code: 'BILLING_INACTIVE' });
        if (await dailyPostCapExceeded(owner, req.workspaceId, req.body.pageId)) return res.status(402).json({ error: 'Daily post limit reached.', code: 'PLAN_LIMIT' });
        const phones = scheduled ? cleanPhones(req.body.approverPhones ?? req.body.approverPhone) : [];
        if (phones.length && !isWhatsAppEnabled()) return res.status(400).json({ error: 'WhatsApp approvals are not configured.' });
        // Persist before the external publish so history survives a bookkeeping failure.
        const { data: post, error } = await db.from('scheduled_posts').insert({
            workspace_id: req.workspaceId, user_id: req.user.id, provider: 'instagram', instagram_connection_id: c.id,
            page_id: req.body.pageId, page_name: `@${c.username}`, platforms: ['instagram'],
            content: req.body.content, media_urls: req.body.mediaUrls, timezone: req.body.timezone || 'UTC',
            scheduled_time: scheduled ? new Date(req.body.scheduledTime).toISOString() : new Date().toISOString(),
            status: scheduled ? (phones.length ? 'pending_approval' : 'pending') : 'processing',
            ...(phones.length ? { approver_phones: phones } : {}),
        }).select('*').single();
        if (error) throw error;
        if (scheduled) {
            let approval;
            if (phones.length) {
                await rememberApprovers(req.workspaceId, phones);
                approval = await requestApproval(post).catch(() => ({ sent: false, error: 'Approval notification could not be sent.' }));
            }
            return res.json({ success: true, post, approval, native: false,
                message: approval ? (approval.sent ? 'Sent for approval.' : 'Saved for approval. Resend the notification from the approval queue.') : 'Instagram post scheduled.' });
        }
        const result = await ctx.service.publishPost(c.instagram_user_id, { caption: post.content, mediaUrls: post.media_urls });
        const results = { instagram: result.success ? { success: true, postId: result.data.id } : { success: false, error: result.error } };
        const { error: recordError } = await db.from('scheduled_posts').update({
            status: result.success ? 'published' : 'failed', publish_results: results,
            meta_post_id: result.data?.id || null, published_at: result.success ? new Date().toISOString() : null,
            error_message: result.success ? null : result.error,
        }).eq('id', post.id);
        if (recordError) console.error('[Instagram] Could not record publish result for post', post.id);
        return apiResult(req, res, { ...result, results });
    }));
}

router.delete('/posts/:id', wrap(async (req, res) => {
    const { data: post, error } = await db.from('scheduled_posts').select('id,status')
        .eq('id', req.params.id).eq('workspace_id', req.workspaceId).eq('provider', 'instagram').maybeSingle();
    if (error) throw error;
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (['published', 'processing'].includes(post.status)) return res.status(409).json({
        error: post.status === 'published' ? 'Delete published Instagram posts in the Instagram app.' : 'This post is being published. Please wait.',
    });
    const { data: removed, error: deleted } = await db.from('scheduled_posts').delete()
        .eq('id', post.id).eq('workspace_id', req.workspaceId).eq('status', post.status).select('id');
    if (deleted) throw deleted;
    if (!removed.length) return res.status(409).json({ error: 'Post changed. Refresh and try again.' });
    res.json({ success: true });
}));
return router;
}
export default createInstagramRouter();
