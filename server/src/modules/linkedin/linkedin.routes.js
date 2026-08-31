/**
 * LinkedIn API Routes
 *
 * Meta's module is the template here — same route names, same response
 * envelopes, same `const ctx = await loadConnection(req, res); if (!ctx) return;`
 * idiom — with two deliberate divergences:
 *
 *  1. The OAuth callback signs and verifies `state` and writes the connection
 *     server-side, rather than bouncing the raw token back through the
 *     browser URL the way modules/meta does. A LinkedIn token lives 60 days
 *     and cannot be refreshed by a non-partner app, so putting it in browser
 *     history, Referer headers and proxy logs is not a trade worth copying.
 *  2. loadLinkedInConnection prechecks token_expires_at before any API call.
 *     Meta has debug_token for live validation; LinkedIn has no equivalent,
 *     so the expiry column is the only signal we get.
 *
 * There is no /posts/scheduled here on purpose — GET /api/meta/posts/scheduled
 * makes no Meta API calls and already returns every provider's rows.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import { env } from '../../config/env.js';

import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

import LinkedInService from './linkedin.service.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { encryptData, decryptData } from '../../shared/utils/encryption.js';
import { uploadPostMedia, postMediaUpload } from '../../shared/storage/postMedia.js';

const router = express.Router();

// Service-role client to bypass RLS, matching the other modules.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── LinkedIn App Config ──
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
// Derived from PUBLIC_URL so a new tunnel URL is a one-line change. An
// explicit LINKEDIN_REDIRECT_URI still wins, for hosts with a fixed callback.
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI
    || `${env.publicUrl}/api/linkedin/oauth/callback`;
const FRONTEND_URL = env.frontendUrl;
// Client route the OAuth callback bounces back to.
const LINKEDIN_RETURN_PATH = process.env.LINKEDIN_RETURN_PATH || '/socialdashboad';

// LinkedIn calls the callback directly in the browser, without a Bearer token
// of ours — the signed `state` is what attributes it to a user.
const PUBLIC_PATHS = ['/oauth/callback'];

router.use((req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    return authenticateUser(req, res, next);
});

// Everything past the auth guard operates on exactly one workspace.
// The OAuth callback is exempt: it carries no session, and its workspace comes
// from the signed state instead.
router.use((req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    return resolveWorkspace(req, res, next);
});

const returnUrl = (query) => `${FRONTEND_URL}${LINKEDIN_RETURN_PATH}?${query}`;

// ==================== OAUTH STATE ====================

// The OAuth state has to survive a round trip through LinkedIn with no server
// session, so it carries the user id and is signed with ENCRYPTION_KEY. This
// is the same HMAC + timingSafeEqual shape modules/meta uses to verify Meta's
// signed_request.
const STATE_TTL_MS = 15 * 60 * 1000;

const signState = (payload) => crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY || '')
    .update(payload)
    .digest('hex');

const createState = (userId, workspaceId) => {
    const payload = Buffer.from(`${userId}.${workspaceId}.${Date.now()}`).toString('base64url');
    return `${payload}.${signState(payload)}`;
};

/**
 * @returns {{userId: string, workspaceId: string|null}|null}
 *   null if the state is forged or stale.
 */
const verifyState = (state) => {
    if (typeof state !== 'string') return null;

    const idx = state.lastIndexOf('.');
    if (idx <= 0) return null;

    const payload = state.slice(0, idx);
    const signature = state.slice(idx + 1);
    const expected = signState(payload);

    // Compare as buffers of equal length, or timingSafeEqual throws.
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    // Two-field states are pre-workspace and may still be in flight. The
    // 15-minute TTL means this branch can be deleted one release later.
    const parts = Buffer.from(payload, 'base64url').toString('utf8').split('.');
    const [userId, workspaceId, issuedAt] = parts.length === 3
        ? parts
        : [parts[0], null, parts[1]];

    if (!userId || !issuedAt) return null;
    if (Date.now() - Number(issuedAt) > STATE_TTL_MS) return null;

    return { userId, workspaceId: workspaceId || null };
};

// ==================== HELPERS ====================

/**
 * Per-request connection context.
 *
 * Mirrors loadConnection in modules/meta (which is file-local there, so it
 * cannot be imported) and keeps the same contract: returns null AFTER having
 * responded, so callers use `if (!ctx) return;`.
 *
 * A shared makeConnectionLoader({table, Service}) factory is the obvious
 * refactor, but it would mean editing the working Meta module for no
 * functional gain. Deliberately deferred.
 */
const loadConnection = async (req, res) => {
    const { data: connection, error } = await supabase
        .from('linkedin_connections')
        .select('*')
        .eq('workspace_id', req.workspaceId)
        .eq('is_active', true)
        .single();

    if (error || !connection) {
        res.status(404).json({ error: 'No active LinkedIn connection' });
        return null;
    }

    // LinkedIn has no debug_token equivalent, so the stored expiry is the only
    // way to fail fast instead of burning a call on a dead token.
    if (connection.token_expires_at && new Date(connection.token_expires_at) <= new Date()) {
        await supabase
            .from('linkedin_connections')
            .update({ is_active: false })
            .eq('id', connection.id);

        res.status(401).json({
            success: false,
            error: 'Your LinkedIn connection expired. Please reconnect your account.',
            code: 'TOKEN_EXPIRED',
        });
        return null;
    }

    let accessToken;
    try {
        accessToken = decryptData(connection.access_token);
        if (!accessToken) throw new Error('Decrypted token is null');
    } catch (e) {
        console.error('Decryption failed! Encryption key may have changed.', e);
        res.status(500).json({ error: 'Failed to decrypt access token. Please reconnect your account.' });
        return null;
    }

    return { connection, accessToken, linkedinService: new LinkedInService(accessToken) };
};

/**
 * Normalise a LinkedIn API failure into a response.
 *
 * Same contract as handleMetaError — including the literal 'TOKEN_EXPIRED'
 * code the client keys on — but LinkedIn signals a dead token with HTTP 401
 * (serviceErrorCode 65600/65601) rather than Meta's 190/463/467, and 403 here
 * almost always means the Community Management API review has not landed.
 */
// Scoped to the workspace: a revoked token in one workspace must not
// deactivate the same person's connections in the others.
const handleLinkedInError = async (res, workspaceId, errorResult) => {
    const revoked = errorResult.status === 401
        || errorResult.code === 65600
        || errorResult.code === 65601;

    if (revoked) {
        console.log(`🔒 [LinkedIn] Token revoked/expired in workspace ${workspaceId}. Deactivating connection.`);

        await supabase
            .from('linkedin_connections')
            .update({ is_active: false })
            .eq('workspace_id', workspaceId);

        return res.status(401).json({
            success: false,
            error: 'LinkedIn session expired. Please reconnect your account.',
            code: 'TOKEN_EXPIRED',
        });
    }

    if (errorResult.status === 403) {
        return res.status(403).json({
            success: false,
            error: 'LinkedIn denied this request. Posting to Company Pages and reading engagement need Community Management API approval.',
            code: 'NEEDS_APPROVAL',
        });
    }

    return res.status(400).json({ error: errorResult.error });
};

/** Author URNs this connection may post as. Organizations stay empty until approved. */
const actorsFor = (connection) => {
    const actors = [];

    if (connection.author_urn) {
        actors.push({
            urn: connection.author_urn,
            name: connection.display_name || 'LinkedIn profile',
            type: 'member',
            avatarUrl: connection.avatar_url || null,
        });
    }

    const selected = connection.selected_org_ids;
    for (const org of connection.organizations || []) {
        if (Array.isArray(selected) && !selected.includes(org.urn)) continue;
        actors.push({ urn: org.urn, name: org.name, type: 'org', avatarUrl: org.avatarUrl || null });
    }

    return actors;
};

const daysUntil = (timestamp) => {
    if (!timestamp) return null;
    return Math.floor((new Date(timestamp).getTime() - Date.now()) / 86400000);
};

// ==================== CONNECTION ROUTES ====================

/**
 * Start the OAuth flow
 * GET /api/linkedin/oauth/url
 */
router.get('/oauth/url', (req, res) => {
    if (!LINKEDIN_CLIENT_ID) {
        return res.status(500).json({ error: 'LINKEDIN_CLIENT_ID is not configured' });
    }

    const target = req.query.target === 'organization' ? 'organization' : 'member';

    // Asking for a scope the app is not approved for makes LinkedIn reject the
    // authorization outright -- taking member sign-in down with it. Refuse
    // here, with a reason, rather than sending the user into that.
    if (target === 'organization' && !LinkedInService.ORG_CONNECT_AVAILABLE) {
        return res.status(403).json({
            success: false,
            error: 'Posting to a LinkedIn Company Page needs Community Management API approval, which this app does not have yet.',
            code: 'NEEDS_APPROVAL',
        });
    }

    const scopes = LinkedInService.scopesFor(target);

    const url = LinkedInService.getOAuthUrl(
        LINKEDIN_CLIENT_ID,
        LINKEDIN_REDIRECT_URI,
        scopes,
        createState(req.user.id, req.workspaceId),
    );

    res.json({ success: true, url, target, scopes });
});

/**
 * OAuth callback — LinkedIn redirects the browser here.
 * GET /api/linkedin/oauth/callback
 *
 * Public: no Bearer token. The signed state is the only thing tying this
 * request to a user, which is why it is verified rather than merely read.
 */
router.get('/oauth/callback', async (req, res) => {
    try {
        const { code, state, error, error_description: errorDescription } = req.query;

        if (error) {
            return res.redirect(returnUrl(`error=${encodeURIComponent(errorDescription || error)}`));
        }
        if (!code) {
            return res.redirect(returnUrl('error=No authorization code received'));
        }

        const verified = verifyState(state);
        if (!verified) {
            return res.redirect(returnUrl('error=Invalid or expired sign-in request. Please try again.'));
        }

        const { userId } = verified;

        // The callback carries no session, so the workspace rides in the signed
        // state. A pre-workspace state resolves to the caller's default.
        let workspaceId = verified.workspaceId;
        if (!workspaceId) {
            const { data: resolved, error: rpcError } = await supabase
                .rpc('ensure_default_workspace', { p_user: userId });
            if (rpcError || !resolved) {
                console.error('[LinkedIn Connect] Could not resolve a workspace:', rpcError);
                return res.redirect(returnUrl('error=Could not resolve a workspace'));
            }
            workspaceId = resolved;
        }

        const tokenResult = await LinkedInService.exchangeCodeForToken(
            code,
            LINKEDIN_CLIENT_ID,
            LINKEDIN_CLIENT_SECRET,
            LINKEDIN_REDIRECT_URI,
        );

        if (!tokenResult.success) {
            return res.redirect(returnUrl(`error=${encodeURIComponent(tokenResult.error)}`));
        }

        const service = new LinkedInService(tokenResult.accessToken);

        const profile = await service.getUserInfo();
        if (!profile.success) {
            return res.redirect(returnUrl(`error=${encodeURIComponent(profile.error)}`));
        }

        const orgResult = await service.getOrganizations(tokenResult.scope);

        let encryptedToken;
        let encryptedRefresh = null;
        try {
            encryptedToken = encryptData(tokenResult.accessToken);
            if (tokenResult.refreshToken) encryptedRefresh = encryptData(tokenResult.refreshToken);
        } catch (encError) {
            console.error('💥 [LinkedIn Connect] Encryption failed:', encError);
            return res.redirect(returnUrl('error=Server encryption configuration error'));
        }

        // 60 days, and for a non-partner app there is no way to extend it.
        const expiresAt = tokenResult.expiresIn
            ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
            : null;

        const { error: dbError } = await supabase
            .from('linkedin_connections')
            .upsert({
                workspace_id: workspaceId,
                // Who connected it. The workspace owns the connection, so a
                // later reconnect by a different member overwrites this.
                user_id: userId,
                linkedin_user_id: profile.sub,
                author_urn: profile.authorUrn,
                display_name: profile.name,
                avatar_url: profile.picture,
                access_token: encryptedToken,
                refresh_token: encryptedRefresh,
                token_expires_at: expiresAt,
                granted_scopes: tokenResult.scope,
                organizations: orgResult.success ? orgResult.organizations : [],
                // A fresh grant resets any previous nudge.
                expiry_notified_at: null,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id' });

        if (dbError) {
            console.error('❌ [LinkedIn Connect] Database error:', dbError);
            return res.redirect(returnUrl('error=Could not save the LinkedIn connection'));
        }

        console.log(`✅ [LinkedIn Connect] Connected ${profile.name} for user ${userId}`);

        // No token in the querystring — the row is already written.
        return res.redirect(returnUrl('linkedin_connected=1'));
    } catch (err) {
        console.error('LinkedIn OAuth callback error:', err);
        return res.redirect(returnUrl(`error=${encodeURIComponent(err.message)}`));
    }
});

/**
 * Connection status
 * GET /api/linkedin/connection
 */
router.get('/connection', async (req, res) => {
    try {
        const { data: connection, error } = await supabase
            .from('linkedin_connections')
            .select('*')
            .eq('workspace_id', req.workspaceId)
            .single();

        if (error || !connection) {
            return res.json({ connected: false });
        }

        const grantedScopes = connection.granted_scopes || [];
        const days = daysUntil(connection.token_expires_at);
        const expired = days !== null && days <= 0;

        res.json({
            connected: true,
            // Mirrors the Meta shape: the client gates on connected && isValid.
            isValid: connection.is_active && !expired,
            displayName: connection.display_name,
            avatarUrl: connection.avatar_url,
            actors: actorsFor(connection),
            grantedScopes,
            // The dormancy switch — the client renders org targets only when true.
            canPostAsOrg: grantedScopes.includes('w_organization_social')
                && grantedScopes.includes('rw_organization_admin'),
            // Whether the Company Page connect option should be offered at all.
            orgConnectAvailable: LinkedInService.ORG_CONNECT_AVAILABLE,
            expiresAt: connection.token_expires_at,
            daysUntilExpiry: days,
            // LinkedIn tokens cannot be refreshed by a non-partner app, so the
            // only remedy is a timely prompt to reconnect.
            needsReconnect: days !== null && days <= 7,
            expired,
        });
    } catch (err) {
        console.error('Get LinkedIn connection error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Re-read the member profile and administered organizations
 * POST /api/linkedin/refresh-accounts
 */
router.post('/refresh-accounts', async (req, res) => {
    try {
        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const profile = await ctx.linkedinService.getUserInfo();
        if (!profile.success) {
            return handleLinkedInError(res, req.workspaceId, profile);
        }

        const grantedScopes = ctx.connection.granted_scopes || [];
        const orgResult = await ctx.linkedinService.getOrganizations(grantedScopes);

        const { error } = await supabase
            .from('linkedin_connections')
            .update({
                display_name: profile.name,
                avatar_url: profile.picture,
                author_urn: profile.authorUrn,
                organizations: orgResult.success ? orgResult.organizations : ctx.connection.organizations,
                updated_at: new Date().toISOString(),
            })
            .eq('workspace_id', req.workspaceId);

        if (error) throw error;

        res.json({
            success: true,
            actors: actorsFor({
                ...ctx.connection,
                display_name: profile.name,
                avatar_url: profile.picture,
                author_urn: profile.authorUrn,
                organizations: orgResult.success ? orgResult.organizations : ctx.connection.organizations,
            }),
        });
    } catch (err) {
        console.error('LinkedIn refresh accounts error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Choose which organizations to publish to
 * POST /api/linkedin/organizations/select
 *
 * Dormant until Community Management approval — organizations is [] until then.
 */
router.post('/organizations/select', async (req, res) => {
    try {
        const { orgUrns } = req.body;

        if (!Array.isArray(orgUrns)) {
            return res.status(400).json({ error: 'orgUrns must be an array' });
        }

        const { error } = await supabase
            .from('linkedin_connections')
            .update({ selected_org_ids: orgUrns, updated_at: new Date().toISOString() })
            .eq('workspace_id', req.workspaceId);

        if (error) throw error;

        res.json({ success: true, selectedOrgIds: orgUrns });
    } catch (err) {
        console.error('LinkedIn select organizations error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Disconnect
 * DELETE /api/linkedin/disconnect
 */
router.delete('/disconnect', async (req, res) => {
    try {
        const { error } = await supabase
            .from('linkedin_connections')
            .delete()
            .eq('workspace_id', req.workspaceId);

        if (error) throw error;

        res.json({ success: true, message: 'LinkedIn account disconnected' });
    } catch (err) {
        console.error('LinkedIn disconnect error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== MEDIA ====================

/**
 * Upload media for a post
 * POST /api/linkedin/posts/upload-media
 */
router.post('/posts/upload-media', postMediaUpload.array('files'), async (req, res) => {
    try {
        const result = await uploadPostMedia(req.user.id, req.files || [], req.workspaceId);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true, urls: result.urls });
    } catch (err) {
        console.error('LinkedIn upload media error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== PUBLISHING ====================

/**
 * Resolve and validate the author URN a request is asking to post as.
 * `pageId` carries the author URN, mirroring how the Meta routes use it for
 * a Page id — that is what lets one wizard drive both providers.
 */
const resolveAuthor = (connection, pageId) => {
    const actors = actorsFor(connection);
    const actor = actors.find((a) => a.urn === String(pageId));

    if (!actor) {
        return { error: 'That LinkedIn profile or Page is not available on this connection' };
    }

    if (actor.type === 'org') {
        const scopes = connection.granted_scopes || [];
        if (!scopes.includes('w_organization_social')) {
            return { error: 'Posting to a LinkedIn Page needs Community Management API approval, which is not granted yet.' };
        }
    }

    return { actor };
};

/**
 * Publish immediately
 * POST /api/linkedin/posts/publish
 */
router.post('/posts/publish', async (req, res) => {
    try {
        const { pageId, content, mediaUrls = [], linkUrl, linkTitle, linkDescription } = req.body;

        if (!pageId || !content) {
            return res.status(400).json({ error: 'pageId and content are required' });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const { actor, error: authorError } = resolveAuthor(ctx.connection, pageId);
        if (authorError) return res.status(400).json({ error: authorError });

        // Multi-image posts use a different content shape (content.multiImage);
        // until that is built, be explicit rather than silently dropping images.
        if (mediaUrls.length > 1) {
            return res.status(400).json({ error: 'LinkedIn posts currently support one image or video.' });
        }

        const result = await ctx.linkedinService.publishPost(actor.urn, {
            commentary: content,
            mediaUrls,
            linkUrl,
            linkTitle,
            linkDescription,
        });

        const results = result.success
            ? { linkedin: { success: true, postId: result.postUrn } }
            : { linkedin: { success: false, error: result.error } };

        // Record the attempt so an immediate publish shows up in Post History
        // and counts toward the delivery stats, exactly like a scheduled one.
        const { error: recordError } = await supabase
            .from('scheduled_posts')
            .insert({
                workspace_id: req.workspaceId,
                user_id: req.user.id,
                provider: 'linkedin',
                linkedin_connection_id: ctx.connection.id,
                page_id: actor.urn,
                page_name: actor.name,
                platforms: ['linkedin'],
                content,
                media_urls: mediaUrls || [],
                link_url: linkUrl || null,
                scheduled_time: new Date().toISOString(),
                status: result.success ? 'published' : 'failed',
                published_at: result.success ? new Date().toISOString() : null,
                meta_post_id: result.success ? result.postUrn : null,
                publish_results: results,
                error_message: result.success ? null : result.error,
            });

        // Never fail the request over bookkeeping — the post is already live.
        if (recordError) {
            console.error('Publish recorded to LinkedIn but not to scheduled_posts:', recordError);
        }

        if (!result.success) {
            return handleLinkedInError(res, req.workspaceId, result);
        }

        res.json({
            success: true,
            page: { id: actor.urn, name: actor.name },
            results,
        });
    } catch (err) {
        console.error('LinkedIn publish error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Schedule a post
 * POST /api/linkedin/posts/schedule
 *
 * LinkedIn has no native scheduling — lifecycleState accepts only PUBLISHED
 * on create — so the row sits here and modules/scheduler publishes it.
 */
router.post('/posts/schedule', async (req, res) => {
    try {
        const { pageId, content, mediaUrls = [], linkUrl, scheduledTime, timezone } = req.body;

        if (!pageId || !content || !scheduledTime) {
            return res.status(400).json({ error: 'pageId, content, and scheduledTime are required' });
        }

        const when = new Date(scheduledTime);
        if (Number.isNaN(when.getTime())) {
            return res.status(400).json({ error: 'scheduledTime is not a valid date' });
        }
        if (when.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'scheduledTime must be in the future' });
        }

        if (mediaUrls.length > 1) {
            return res.status(400).json({ error: 'LinkedIn posts currently support one image or video.' });
        }

        const { data: connection, error: connError } = await supabase
            .from('linkedin_connections')
            .select('*')
            .eq('workspace_id', req.workspaceId)
            .eq('is_active', true)
            .single();

        if (connError || !connection) {
            return res.status(404).json({ error: 'No active LinkedIn connection' });
        }

        const { actor, error: authorError } = resolveAuthor(connection, pageId);
        if (authorError) return res.status(400).json({ error: authorError });

        // A LinkedIn token dies at 60 days and cannot be renewed silently, so
        // scheduling past that point is a post that will certainly fail.
        const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
        const expiresBeforePublish = expiresAt && when > expiresAt;

        const { data: scheduledPost, error } = await supabase
            .from('scheduled_posts')
            .insert({
                workspace_id: req.workspaceId,
                user_id: req.user.id,
                provider: 'linkedin',
                linkedin_connection_id: connection.id,
                page_id: actor.urn,
                page_name: actor.name,
                platforms: ['linkedin'],
                content,
                media_urls: mediaUrls || [],
                link_url: linkUrl || null,
                scheduled_time: scheduledTime,
                timezone: timezone || 'UTC',
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;

        console.log(`📅 LinkedIn post scheduled for ${scheduledTime} as ${actor.name}`);

        res.json({
            success: true,
            message: 'Post scheduled successfully',
            post: scheduledPost,
            ...(expiresBeforePublish
                ? {
                    warning: `This is scheduled after your LinkedIn connection expires on ${expiresAt.toDateString()}. Reconnect before then or the post will fail.`,
                }
                : {}),
        });
    } catch (err) {
        console.error('LinkedIn schedule post error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Cancel a scheduled post, or delete one that already went live.
 * DELETE /api/linkedin/posts/:id
 *
 * Same status codes and envelope as the Meta route so the client needs only a
 * prefix swap. Simpler in one respect: LinkedIn deletion works for members and
 * Pages alike, so there is no undeletable case the way Instagram has.
 */
router.delete('/posts/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const { data: post, error: fetchError } = await supabase
            .from('scheduled_posts')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', req.workspaceId)
            .eq('provider', 'linkedin')
            .single();

        if (fetchError || !post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // The scheduler owns this row for the length of one publish attempt.
        if (post.status === 'processing') {
            return res.status(409).json({
                error: 'This post is being published right now. Try again in a moment.',
            });
        }

        // Drops the row only if its status has not changed since we read it.
        const dropRow = async () => {
            const { data: deleted, error } = await supabase
                .from('scheduled_posts')
                .delete()
                .eq('id', id)
                .eq('workspace_id', req.workspaceId)
                .eq('status', post.status)
                .select('id');
            if (error) throw error;
            return deleted?.length > 0;
        };

        const staleConflict = () => res.status(409).json({
            error: 'This post changed while you were deleting it. Reload and try again.',
        });

        // Nothing is live on LinkedIn — the row is the entire post.
        if (post.status !== 'published') {
            if (!await dropRow()) return staleConflict();
            return res.json({
                success: true,
                removedFrom: [],
                message: 'Scheduled post cancelled',
            });
        }

        const results = post.publish_results || {};
        const live = Object.entries(results)
            .filter(([, r]) => r?.success && r.postId && !r.deleted);

        if (live.length === 0) {
            if (!await dropRow()) return staleConflict();
            return res.json({
                success: true,
                removedFrom: [],
                message: 'Removed from history. No LinkedIn post id was recorded, so nothing was deleted on LinkedIn.',
            });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const removedFrom = [];
        const remaining = [];
        const nextResults = { ...results };

        for (const [platform, result] of live) {
            const deletion = await ctx.linkedinService.deletePost(result.postId);

            if (deletion.success) {
                removedFrom.push(platform);
                nextResults[platform] = { ...result, deleted: true, deletedAt: new Date().toISOString() };
            } else {
                remaining.push({ platform, reason: deletion.error });
            }
        }

        if (remaining.length === 0) {
            if (!await dropRow()) return staleConflict();
            return res.json({
                success: true,
                removedFrom,
                message: `Deleted from ${removedFrom.join(' and ')}`,
            });
        }

        // Something is still up on LinkedIn. Keep the row so history stays
        // honest, but record the parts we did manage to delete.
        await supabase
            .from('scheduled_posts')
            .update({ publish_results: nextResults, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('workspace_id', req.workspaceId);

        return res.status(409).json({
            success: false,
            removedFrom,
            remaining,
            error: remaining.map((r) => r.reason).join(' '),
        });
    } catch (err) {
        console.error('LinkedIn delete post error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Engagement for the LinkedIn posts this app published
 * GET /api/linkedin/posts/metrics?limit=20
 */
router.get('/posts/metrics', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const { data: posts, error } = await supabase
            .from('scheduled_posts')
            .select('id, page_id, page_name, content, platforms, publish_results, published_at, media_urls')
            .eq('workspace_id', req.workspaceId)
            .eq('provider', 'linkedin')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        if (!posts || posts.length === 0) return res.json({ success: true, posts: [] });

        const enriched = await Promise.all(posts.map(async (post) => {
            const entries = Object.entries(post.publish_results || {})
                .filter(([, r]) => r?.success && r.postId && !r.deleted);

            const platforms = await Promise.all(entries.map(async ([platform, r]) => {
                const result = await ctx.linkedinService.getPostMetrics(r.postId);
                return result.success
                    ? { platform, postId: r.postId, ...result.metrics }
                    // Pre-approval this is a 403; render it as unavailable
                    // rather than as zero engagement.
                    : { platform, postId: r.postId, unavailable: true, error: result.error };
            }));

            return {
                id: post.id,
                pageName: post.page_name,
                content: post.content,
                publishedAt: post.published_at,
                mediaUrls: post.media_urls,
                platforms,
            };
        }));

        res.json({ success: true, posts: enriched });
    } catch (err) {
        console.error('LinkedIn metrics error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
