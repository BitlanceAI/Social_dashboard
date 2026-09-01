/**
 * Meta (Facebook / Instagram) API Routes
 *
 * Handles Meta account connection, Facebook Page + Instagram publishing
 * and post scheduling — all through the official Meta Graph API.
 *
 * Ads (campaigns, insights, account balance, Conversions API) are out of
 * scope; the permissions for them are not requested at OAuth time either.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import { env } from '../../config/env.js';

import crypto from 'crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import MetaService from './meta.service.js';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { encryptData, decryptData } from '../../shared/utils/encryption.js';
import { uploadPostMedia, postMediaUpload } from '../../shared/storage/postMedia.js';

const router = express.Router();

// Initialize Supabase with service role key to bypass RLS
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Meta App Config
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
// Derived from PUBLIC_URL so a new tunnel URL is a one-line change. An
// explicit META_REDIRECT_URI still wins, for hosts with a fixed callback.
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `${env.publicUrl}/api/meta/oauth/callback`;
const FRONTEND_URL = env.frontendUrl;
// Where the OAuth callback bounces the browser back to. Must be a real client
// route — MetaDashboardPage reads ?oauth_success / ?token / ?error from it.
const META_RETURN_PATH = process.env.META_RETURN_PATH || '/socialdashboad';
const returnUrl = (query) => `${FRONTEND_URL}${META_RETURN_PATH}?${query}`;

// Apply auth middleware to all routes except the OAuth redirect callback,
// which Meta calls directly in the browser without a Bearer token.
// Meta calls these directly (browser redirect or server-to-server signed
// request), so they carry no Bearer token of ours.
const PUBLIC_PATHS = ['/oauth/callback', '/deauthorize', '/data-deletion'];

router.use((req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    return authenticateUser(req, res, next);
});

// Everything past the auth guard operates on exactly one workspace.
// resolveWorkspace verifies membership and replaces the raw x-workspace-id
// header with a trusted id, falling back to the caller's default workspace so
// a client that predates this feature keeps working unchanged.
router.use((req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    return resolveWorkspace(req, res, next);
});

/**
 * Verify and decode a Meta signed_request (base64url payload.signature,
 * HMAC-SHA256 keyed with the app secret). Returns null if it does not verify.
 */
const parseSignedRequest = (signedRequest) => {
    if (!signedRequest || !META_APP_SECRET) return null;

    const [encodedSig, payload] = String(signedRequest).split('.');
    if (!encodedSig || !payload) return null;

    const expected = crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(payload)
        .digest();

    let provided;
    try {
        provided = Buffer.from(encodedSig, 'base64url');
    } catch {
        return null;
    }

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
    }

    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
};

/**
 * Delete everything we hold for a Meta user id. Meta identifies the person by
 * their app-scoped id, which is what we stored as the connection's meta_user_id.
 */
const purgeMetaUser = async (metaUserId) => {
    const { data: connections } = await supabase
        .from('meta_connections')
        .select('id, user_id')
        .eq('meta_user_id', metaUserId);

    if (!connections || connections.length === 0) return 0;

    const connectionIds = connections.map((c) => c.id);

    // Scope the cascade by CONNECTION id, never by user id. Filtering on
    // user_id deleted every scheduled_posts row that person owned — including
    // their LinkedIn posts, which this webhook has no business touching, and
    // (once one Meta account can appear in several workspaces) posts belonging
    // to a workspace connected to an entirely different Meta account.
    //
    // scheduled_posts.meta_connection_id is ON DELETE CASCADE, so the first
    // delete is belt-and-braces; it makes the intent explicit.
    await supabase.from('scheduled_posts').delete().in('meta_connection_id', connectionIds);
    await supabase.from('meta_connections').delete().in('id', connectionIds);

    return connections.length;
};

/**
 * Load the caller's active Meta connection and decrypt its access token.
 * Returns null (after responding) when there is nothing usable.
 */
const loadConnection = async (req, res) => {
    const { data: connection, error } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('workspace_id', req.workspaceId)
        .eq('is_active', true)
        .single();

    if (error || !connection) {
        res.status(404).json({ error: 'No active Meta connection' });
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

    return { connection, accessToken, metaService: new MetaService(accessToken) };
};

// Helper to handle Meta API errors
// Scoped to the workspace: a bad token in one workspace must not deactivate
// the same person's connections in the others.
const handleMetaError = async (res, workspaceId, errorResult) => {
    if (errorResult.code === 190 || errorResult.code === 463 || errorResult.code === 467) {
        console.log(`🔒 [Meta] Token expired/invalid (Code ${errorResult.code}) in workspace ${workspaceId}. Deactivating connection.`);

        await supabase
            .from('meta_connections')
            .update({ is_active: false })
            .eq('workspace_id', workspaceId);

        return res.status(401).json({
            success: false,
            error: 'Meta session expired. Please reconnect your account.',
            code: 'TOKEN_EXPIRED'
        });
    }
    return res.status(400).json({ error: errorResult.error });
};

// ==================== UPLOAD ROUTES ====================

/**
 * Upload Media for Posts
 * POST /api/meta/posts/upload-media
 */
router.post('/posts/upload-media', postMediaUpload.array('files'), async (req, res) => {
    try {
        const result = await uploadPostMedia(req.user.id, req.files || [], req.workspaceId);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true, urls: result.urls });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: `Upload failed: ${error.message}` });
    }
});

// ==================== CONNECTION ROUTES ====================

/**
 * Connect Meta account using a long-lived access token
 * POST /api/meta/connect-api-key
 */
router.post('/connect-api-key', async (req, res) => {
    try {
        const { accessToken, appId, appSecret } = req.body;
        const userId = req.user.id;

        console.log(`🔌 [Meta Connect] Request received for user ${userId}`);

        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        const metaService = new MetaService(accessToken);
        const validation = await metaService.validateToken();

        if (!validation.success || !validation.isValid) {
            console.log(`❌ [Meta Connect] Token invalid:`, validation);
            return res.status(400).json({ error: 'Invalid access token' });
        }

        const profile = await metaService.getMe();
        if (!profile.success) {
            return res.status(400).json({ error: 'Failed to fetch Meta profile' });
        }

        const pagesResult = await metaService.getPages();
        console.log(`✅ [Meta Connect] Pages: ${pagesResult.success ? pagesResult.pages?.length : 'failed'}`);

        let encryptedToken, encryptedAppSecret;
        try {
            encryptedToken = encryptData(accessToken);
            encryptedAppSecret = appSecret ? encryptData(appSecret) : null;
        } catch (encError) {
            console.error(`💥 [Meta Connect] Encryption failed:`, encError);
            return res.status(500).json({ error: 'Server encryption configuration error' });
        }

        const { data: existingConn } = await supabase
            .from('meta_connections')
            .select('whatsapp_phone_id, waba_id, meta_user_id, selected_page_ids')
            .eq('workspace_id', req.workspaceId)
            .single();

        // Reconnecting the same Meta account keeps the chosen Pages; a
        // different account starts over, or we would filter against stale ids.
        const sameAccount = existingConn?.meta_user_id === profile.data.id;
        const carriedSelection = sameAccount ? (existingConn?.selected_page_ids ?? null) : null;

        const { error } = await supabase
            .from('meta_connections')
            .upsert({
                workspace_id: req.workspaceId,
                // Who connected it. The workspace owns the connection, so a
                // later reconnect by a different member overwrites this.
                user_id: userId,
                connection_type: 'api_key',
                // App-scoped Meta user id — how Meta identifies the person in
                // deauthorize / data-deletion callbacks
                meta_user_id: profile.data.id,
                access_token: encryptedToken,
                app_id: appId || null,
                app_secret: encryptedAppSecret,
                token_expires_at: validation.expiresAt,
                pages: pagesResult.success ? pagesResult.pages : [],
                is_active: true,
                // Preserve existing WhatsApp config if present
                whatsapp_phone_id: existingConn?.whatsapp_phone_id || null,
                waba_id: existingConn?.waba_id || null,
                selected_page_ids: carriedSelection,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'workspace_id'
            })
            .select()
            .single();

        if (error) {
            console.error(`❌ [Meta Connect] Database error:`, error);
            throw error;
        }

        console.log(`✅ [Meta Connect] Meta account connected successfully for user ${userId}`);

        res.json({
            success: true,
            message: 'Meta account connected successfully',
            profile: profile.data,
            pages: pagesResult.success ? pagesResult.pages : [],
            expiresAt: validation.expiresAt
        });

    } catch (error) {
        console.error('Meta connect error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get OAuth authorization URL
 * GET /api/meta/oauth/url
 */
router.get('/oauth/url', (req, res) => {
    if (!META_APP_ID) {
        return res.status(500).json({ error: 'Meta App ID not configured' });
    }

    // The user id doubles as CSRF state so the callback can attribute the token.
    const authUrl = MetaService.getOAuthUrl(META_APP_ID, META_REDIRECT_URI, null, req.user.id);
    res.json({ success: true, url: authUrl, scopes: MetaService.DEFAULT_SCOPES });
});

/**
 * OAuth callback handler
 * GET /api/meta/oauth/callback
 */
router.get('/oauth/callback', async (req, res) => {
    try {
        const { code, error, error_description } = req.query;

        if (error) {
            return res.redirect(returnUrl(`error=${encodeURIComponent(error_description || error)}`));
        }

        if (!code) {
            return res.redirect(returnUrl(`error=${encodeURIComponent('No authorization code received')}`));
        }

        const tokenResult = await MetaService.exchangeCodeForToken(
            code,
            META_APP_ID,
            META_APP_SECRET,
            META_REDIRECT_URI
        );

        if (!tokenResult.success) {
            return res.redirect(returnUrl(`error=${encodeURIComponent(tokenResult.error)}`));
        }

        const longLivedResult = await MetaService.exchangeToken(
            tokenResult.accessToken,
            META_APP_ID,
            META_APP_SECRET
        );

        const finalToken = longLivedResult.success ? longLivedResult.accessToken : tokenResult.accessToken;
        const expiresIn = longLivedResult.success ? longLivedResult.expiresIn : tokenResult.expiresIn;

        // The frontend finishes the handshake by POSTing this token to
        // /connect-api-key with the user's own Bearer token.
        res.redirect(returnUrl(`oauth_success=true&token=${encodeURIComponent(finalToken)}&expires_in=${expiresIn}`));

    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect(returnUrl(`error=${encodeURIComponent(error.message)}`));
    }
});

/**
 * Get current Meta connection status
 * GET /api/meta/connection
 */
router.get('/connection', async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: connection, error } = await supabase
            .from('meta_connections')
            .select('*')
            .eq('workspace_id', req.workspaceId)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!connection) {
            return res.json({ connected: false });
        }

        const decryptedToken = decryptData(connection.access_token);
        const metaService = new MetaService(decryptedToken);
        const validation = await metaService.validateToken();

        const allPages = connection.pages || [];
        const selectedIds = connection.selected_page_ids;

        // null = the user has not chosen yet, so prompt them. An empty array is
        // a deliberate "none", and is respected.
        const needsPageSelection = selectedIds === null || selectedIds === undefined;
        const pages = needsPageSelection
            ? []
            : allPages.filter((p) => selectedIds.includes(String(p.id)));

        res.json({
            connected: true,
            isValid: validation.isValid,
            grantedScopes: validation.scopes || [],
            // What the app asks for — lets the client show which grants the
            // stored token is missing, instead of features failing silently.
            requiredScopes: MetaService.DEFAULT_SCOPES,
            expiresAt: connection.token_expires_at,
            needsPageSelection,
            // Every Page Meta returned, for the picker
            availablePages: allPages.map((p) => ({
                id: p.id,
                name: p.name,
                category: p.category,
                picture: p.picture,
                instagram_business_account: p.instagram_business_account || null
            })),
            selectedPageIds: needsPageSelection ? [] : selectedIds,
            pages,
            // Instagram Business accounts reachable through the connected pages
            instagramAccounts: pages
                .filter((p) => p.instagram_business_account?.id)
                .map((p) => ({
                    ...p.instagram_business_account,
                    pageId: p.id,
                    pageName: p.name
                })),
            connectionType: connection.connection_type,
            whatsappPhoneId: connection.whatsapp_phone_id || '',
            wabaId: connection.waba_id || ''
        });

    } catch (error) {
        console.error('Get connection error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Disconnect Meta account
 * DELETE /api/meta/disconnect
 */
router.delete('/disconnect', async (req, res) => {
    try {
        const userId = req.user.id;

        const { error } = await supabase
            .from('meta_connections')
            .delete()
            .eq('workspace_id', req.workspaceId);

        if (error) throw error;

        console.log(`🔌 Meta account disconnected for user ${userId}`);

        res.json({ success: true, message: 'Meta account disconnected' });

    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Refresh pages and ad accounts
 * POST /api/meta/refresh-accounts
 */
router.post('/refresh-accounts', async (req, res) => {
    try {
        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const { connection, metaService } = ctx;

        const pagesResult = await metaService.getPages();

        const freshPages = pagesResult.success ? pagesResult.pages : connection.pages;

        // Keep the user's choice, minus any Page they no longer manage
        const stillAvailable = (freshPages || []).map((p) => String(p.id));
        const prunedSelection = Array.isArray(connection.selected_page_ids)
            ? connection.selected_page_ids.filter((id) => stillAvailable.includes(String(id)))
            : connection.selected_page_ids;

        const { error: updateError } = await supabase
            .from('meta_connections')
            .update({
                pages: freshPages,
                selected_page_ids: prunedSelection,
                updated_at: new Date().toISOString()
            })
            .eq('workspace_id', req.workspaceId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            pages: pagesResult.success ? pagesResult.pages : []
        });

    } catch (error) {
        console.error('Refresh accounts error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Choose which Pages to connect
 * POST /api/meta/pages/select   body: { pageIds: string[] }
 *
 * The full Page list stays in `pages` (we need it for the picker and for
 * page access tokens); this records the subset the user opted into.
 */
router.post('/pages/select', async (req, res) => {
    try {
        const { pageIds } = req.body;

        if (!Array.isArray(pageIds)) {
            return res.status(400).json({ error: 'pageIds must be an array' });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const available = (ctx.connection.pages || []).map((p) => String(p.id));
        const invalid = pageIds.filter((id) => !available.includes(String(id)));
        if (invalid.length) {
            return res.status(400).json({ error: `Not available on this connection: ${invalid.join(', ')}` });
        }

        const { error } = await supabase
            .from('meta_connections')
            .update({
                selected_page_ids: pageIds.map(String),
                updated_at: new Date().toISOString()
            })
            .eq('workspace_id', req.workspaceId);

        if (error) throw error;

        console.log(`[Meta] User ${req.user.id} connected ${pageIds.length} page(s)`);
        res.json({ success: true, selectedPageIds: pageIds.map(String) });

    } catch (error) {
        console.error('Select pages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== INSTAGRAM ROUTES ====================

/**
 * List Instagram Business accounts linked to the connected Pages
 * GET /api/meta/instagram/accounts
 */
router.get('/instagram/accounts', async (req, res) => {
    try {
        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const pagesResult = await ctx.metaService.getPages();
        if (!pagesResult.success) {
            return handleMetaError(res, req.workspaceId, pagesResult);
        }

        const accounts = (pagesResult.pages || [])
            .filter((p) => p.instagram_business_account?.id)
            .map((p) => ({
                ...p.instagram_business_account,
                pageId: p.id,
                pageName: p.name
            }));

        res.json({ success: true, accounts });

    } catch (error) {
        console.error('Get Instagram accounts error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Recent Instagram media for a page's linked account
 * GET /api/meta/instagram/media?pageId=...
 */
router.get('/instagram/media', async (req, res) => {
    try {
        const { pageId, limit = 25 } = req.query;
        if (!pageId) {
            return res.status(400).json({ error: 'pageId is required' });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const tokenResult = await ctx.metaService.getPageToken(pageId);
        if (!tokenResult.success) {
            return handleMetaError(res, req.workspaceId, tokenResult);
        }

        const igResult = await ctx.metaService.getInstagramAccount(pageId, tokenResult.pageAccessToken);
        if (!igResult.success) {
            return res.status(400).json({ error: igResult.error });
        }

        const media = await ctx.metaService.getInstagramMedia(
            igResult.instagramAccount.id,
            tokenResult.pageAccessToken,
            parseInt(limit, 10)
        );

        if (!media.success) {
            return handleMetaError(res, req.workspaceId, media);
        }

        // Remaining publishing quota (Meta allows 25 posts / 24h per account).
        // Non-fatal: if it fails we still return the media.
        const limitResult = await ctx.metaService.getInstagramPublishingLimit(
            igResult.instagramAccount.id,
            tokenResult.pageAccessToken
        );
        const quota = limitResult.success ? (limitResult.data.data?.[0] || null) : null;

        res.json({
            success: true,
            account: igResult.instagramAccount,
            media: media.data.data || [],
            publishingLimit: quota
                ? { used: quota.quota_usage ?? 0, total: quota.config?.quota_total ?? 25 }
                : null
        });

    } catch (error) {
        console.error('Get Instagram media error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== PUBLISHING ROUTES ====================

/**
 * Publish immediately to Facebook and/or Instagram
 * POST /api/meta/posts/publish
 * body: { pageId, content, mediaUrls?, linkUrl?, platforms?: ['facebook','instagram'] }
 */
router.post('/posts/publish', async (req, res) => {
    try {
        const { pageId, content, mediaUrls = [], linkUrl } = req.body;
        const platforms = (req.body.platforms && req.body.platforms.length)
            ? req.body.platforms
            : ['facebook'];

        if (!pageId || !content) {
            return res.status(400).json({ error: 'pageId and content are required' });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const tokenResult = await ctx.metaService.getPageToken(pageId);
        if (!tokenResult.success) {
            return handleMetaError(res, req.workspaceId, tokenResult);
        }

        const { page, pageAccessToken } = tokenResult;
        const results = {};

        if (platforms.includes('facebook')) {
            const fb = await ctx.metaService.publishPost(pageId, pageAccessToken, {
                message: content,
                link: linkUrl,
                mediaUrls
            });
            results.facebook = fb.success
                ? { success: true, postId: fb.data.id || fb.data.post_id }
                : { success: false, error: fb.error };
        }

        if (platforms.includes('instagram')) {
            const igAccount = await ctx.metaService.getInstagramAccount(pageId, pageAccessToken);
            if (!igAccount.success) {
                results.instagram = { success: false, error: igAccount.error };
            } else {
                const ig = await ctx.metaService.publishInstagramPost(
                    igAccount.instagramAccount.id,
                    pageAccessToken,
                    { caption: content, mediaUrls }
                );
                results.instagram = ig.success
                    ? { success: true, postId: ig.data.id }
                    : { success: false, error: ig.error };
            }
        }

        const anySuccess = Object.values(results).some((r) => r.success);

        // Record the attempt so an immediate publish shows up in Post History
        // and counts toward the delivery stats, exactly like a scheduled one.
        const publishedIds = Object.values(results).filter((r) => r.success).map((r) => r.postId);
        const failures = Object.entries(results)
            .filter(([, r]) => !r.success)
            .map(([platform, r]) => `${platform}: ${r.error}`);

        const { error: recordError } = await supabase
            .from('scheduled_posts')
            .insert({
                workspace_id: req.workspaceId,
                user_id: req.user.id,
                meta_connection_id: ctx.connection.id,
                page_id: pageId,
                page_name: page.name,
                platforms,
                content,
                media_urls: mediaUrls || [],
                link_url: linkUrl || null,
                // Published immediately, so the slot is now
                scheduled_time: new Date().toISOString(),
                status: anySuccess ? 'published' : 'failed',
                published_at: anySuccess ? new Date().toISOString() : null,
                meta_post_id: publishedIds[0] || null,
                publish_results: results,
                error_message: failures.length ? failures.join('; ') : null
            });

        // Never fail the request over bookkeeping — the post is already live.
        if (recordError) {
            console.error('Publish recorded to Meta but not to scheduled_posts:', recordError);
        }

        res.status(anySuccess ? 200 : 400).json({
            success: anySuccess,
            page: { id: page.id, name: page.name },
            results
        });

    } catch (error) {
        console.error('Publish post error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Schedule a post
 * POST /api/meta/posts/schedule
 * body: { pageId, content, mediaUrls?, linkUrl?, scheduledTime, timezone?, platforms? }
 */
router.post('/posts/schedule', async (req, res) => {
    try {
        const userId = req.user.id;
        const { pageId, content, mediaUrls, linkUrl, scheduledTime, timezone } = req.body;
        const platforms = (req.body.platforms && req.body.platforms.length)
            ? req.body.platforms
            : ['facebook'];

        if (!pageId || !content || !scheduledTime) {
            return res.status(400).json({ error: 'pageId, content, and scheduledTime are required' });
        }

        if (platforms.includes('instagram') && (!mediaUrls || mediaUrls.length === 0)) {
            return res.status(400).json({
                error: 'Instagram posts require at least one image or video.'
            });
        }

        const when = new Date(scheduledTime);
        if (Number.isNaN(when.getTime())) {
            return res.status(400).json({ error: 'scheduledTime is not a valid date' });
        }
        if (when.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'scheduledTime must be in the future' });
        }

        const { data: connection, error: connError } = await supabase
            .from('meta_connections')
            .select('*')
            .eq('workspace_id', req.workspaceId)
            .eq('is_active', true)
            .single();

        if (connError || !connection) {
            return res.status(404).json({ error: 'No active Meta connection' });
        }

        const page = (connection.pages || []).find((p) => String(p.id) === String(pageId));
        if (!page) {
            return res.status(404).json({ error: 'Page not found in connected accounts' });
        }

        if (platforms.includes('instagram') && !page.instagram_business_account?.id) {
            return res.status(400).json({
                error: 'No Instagram Business account is linked to this Page. Link one in Meta Business Suite, then refresh accounts.'
            });
        }

        const { data: scheduledPost, error } = await supabase
            .from('scheduled_posts')
            .insert({
                workspace_id: req.workspaceId,
                user_id: userId,
                meta_connection_id: connection.id,
                page_id: pageId,
                page_name: page.name,
                platforms,
                content,
                media_urls: mediaUrls || [],
                link_url: linkUrl || null,
                scheduled_time: scheduledTime,
                timezone: timezone || 'UTC',
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;

        console.log(`📅 Post scheduled for ${scheduledTime} on ${page.name} → ${platforms.join(', ')}`);

        res.json({
            success: true,
            message: 'Post scheduled successfully',
            post: scheduledPost
        });

    } catch (error) {
        console.error('Schedule post error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get scheduled posts
 * GET /api/meta/posts/scheduled
 */
router.get('/posts/scheduled', async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, limit = 50 } = req.query;

        let query = supabase
            .from('scheduled_posts')
            .select('*')
            .eq('workspace_id', req.workspaceId)
            .order('scheduled_time', { ascending: true })
            .limit(parseInt(limit, 10));

        if (status) {
            query = query.eq('status', status);
        }

        const { data: posts, error } = await query;

        if (error) throw error;

        res.json({ success: true, posts: posts || [] });

    } catch (error) {
        console.error('Get scheduled posts error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/meta/posts/history?limit=25
 *
 * LIVE history read from Meta itself: every published post on the
 * connection's Pages and linked Instagram accounts — including posts made
 * natively on Facebook/Instagram, not through this app. (LinkedIn has no
 * equivalent: reading a member's post list needs the restricted
 * r_member_social scope, so LinkedIn history stays app-tracked only.)
 */
router.get('/posts/history', async (req, res) => {
    try {
        const loaded = await loadConnection(req, res);
        if (!loaded) return;

        const perFeedLimit = Math.min(50, parseInt(req.query.limit, 10) || 25);

        // Fresh page list = fresh PAGE tokens; published_posts needs them.
        const pagesResult = await loaded.metaService.getPages();
        if (!pagesResult.success) return handleMetaError(res, req.workspaceId, pagesResult);

        // Honour the user's page selection, same as publishing does.
        const selectedIds = loaded.connection.selected_page_ids;
        const pages = (pagesResult.pages || []).filter(
            (p) => !Array.isArray(selectedIds) || selectedIds.map(String).includes(String(p.id)),
        );

        const feeds = await Promise.all(pages.flatMap((page) => {
            const jobs = [];
            if (page.access_token) {
                jobs.push(loaded.metaService.getPageFeed(page.id, page.name, page.access_token, perFeedLimit));
            }
            if (page.instagram_business_account?.id && page.access_token) {
                jobs.push(loaded.metaService.getInstagramFeed(
                    page.instagram_business_account.id,
                    page.instagram_business_account.username,
                    page.access_token,
                    perFeedLimit,
                ));
            }
            return jobs;
        }));

        // One dead feed should not blank the rest; report failures alongside.
        const posts = [];
        const feedErrors = [];
        for (const feed of feeds) {
            if (feed.success) posts.push(...feed.posts);
            else feedErrors.push(feed.error);
        }
        posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        res.json({ success: true, posts, feedErrors });
    } catch (error) {
        console.error('Get post history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== COMMENT MANAGEMENT ====================

/**
 * Every comment action needs the PAGE token for the page the post belongs
 * to; the client sends pageId alongside, and getPageToken re-derives the
 * token from the user token rather than trusting anything stored.
 */
const withPageToken = async (req, res, pageId) => {
    if (!pageId) {
        res.status(400).json({ error: 'pageId is required' });
        return null;
    }
    const loaded = await loadConnection(req, res);
    if (!loaded) return null;

    const tokenResult = await loaded.metaService.getPageToken(pageId);
    if (!tokenResult.success) {
        await handleMetaError(res, req.workspaceId, tokenResult);
        return null;
    }
    return { ...loaded, pageAccessToken: tokenResult.pageAccessToken };
};

/** GET /api/meta/posts/:postId/comments?pageId= */
router.get('/posts/:postId/comments', async (req, res) => {
    try {
        const ctx = await withPageToken(req, res, req.query.pageId);
        if (!ctx) return;

        const result = await ctx.metaService.getPostComments(req.params.postId, ctx.pageAccessToken);
        if (!result.success) return handleMetaError(res, req.workspaceId, result);

        res.json({ success: true, comments: result.comments });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** POST /api/meta/comments/:commentId/reply  { pageId, message } */
router.post('/comments/:commentId/reply', async (req, res) => {
    try {
        const message = (req.body?.message || '').trim();
        if (!message) return res.status(400).json({ error: 'A reply message is required' });

        const ctx = await withPageToken(req, res, req.body?.pageId);
        if (!ctx) return;

        const result = await ctx.metaService.replyToComment(req.params.commentId, message, ctx.pageAccessToken);
        if (!result.success) return handleMetaError(res, req.workspaceId, result);

        res.status(201).json({ success: true, replyId: result.data?.id });
    } catch (error) {
        console.error('Reply to comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** POST /api/meta/comments/:commentId/hide  { pageId, hidden } */
router.post('/comments/:commentId/hide', async (req, res) => {
    try {
        const ctx = await withPageToken(req, res, req.body?.pageId);
        if (!ctx) return;

        const hidden = req.body?.hidden !== false;
        const result = await ctx.metaService.setCommentHidden(req.params.commentId, hidden, ctx.pageAccessToken);
        if (!result.success) return handleMetaError(res, req.workspaceId, result);

        res.json({ success: true, hidden });
    } catch (error) {
        console.error('Hide comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /api/meta/comments/:commentId?pageId= */
router.delete('/comments/:commentId', async (req, res) => {
    try {
        const ctx = await withPageToken(req, res, req.query.pageId);
        if (!ctx) return;

        const result = await ctx.metaService.deleteComment(req.params.commentId, ctx.pageAccessToken);
        if (!result.success) return handleMetaError(res, req.workspaceId, result);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Cancel a scheduled post, or delete one that already went live.
 * DELETE /api/meta/posts/:id
 *
 * A pending/failed/cancelled post exists only in our table, so removing the
 * row is the whole job. A published one is live on Meta, and deleting only our
 * row would leave it up while telling the user it was gone — so we call Graph
 * first and report per platform.
 *
 * Instagram is the exception: the Graph API has no delete for media, so an IG
 * post can never be removed from here. We say so rather than implying success.
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
            .single();

        if (fetchError || !post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // The scheduler owns this row for the length of one publish attempt.
        // Deleting it now would orphan whatever Meta is midway through accepting.
        if (post.status === 'processing') {
            return res.status(409).json({
                error: 'This post is being published right now. Try again in a moment.'
            });
        }

        // Drops the row only if its status has not changed since we read it —
        // otherwise the scheduler picked it up in between and we must not
        // report a deletion that did not happen.
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

        // Nothing is live on Meta — the row is the entire post.
        if (post.status !== 'published') {
            if (!await dropRow()) {
                return res.status(409).json({
                    error: 'This post changed while you were deleting it. Reload and try again.'
                });
            }
            return res.json({
                success: true,
                removedFromMeta: [],
                message: 'Scheduled post cancelled'
            });
        }

        // Published: find what actually reached each platform.
        const results = post.publish_results || {};
        const live = Object.entries(results)
            .filter(([, r]) => r?.success && r.postId && !r.deleted);

        if (live.length === 0) {
            // Recorded as published but nothing traceable to delete — most
            // likely an older row from before publish_results was stored.
            if (!await dropRow()) {
                return res.status(409).json({
                    error: 'This post changed while you were deleting it. Reload and try again.'
                });
            }
            return res.json({
                success: true,
                removedFromMeta: [],
                message: 'Removed from history. No Meta post id was recorded, so nothing was deleted on Meta.'
            });
        }

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const tokenResult = await ctx.metaService.getPageToken(post.page_id);
        if (!tokenResult.success) {
            return handleMetaError(res, userId, tokenResult);
        }
        const { pageAccessToken } = tokenResult;

        const removedFromMeta = [];
        const remaining = [];
        const nextResults = { ...results };

        for (const [platform, result] of live) {
            if (platform === 'instagram') {
                remaining.push({
                    platform,
                    reason: 'The Meta Graph API has no endpoint for deleting Instagram media. Delete this post in the Instagram app.'
                });
                continue;
            }

            const deletion = await ctx.metaService.deletePost(result.postId, pageAccessToken);

            if (deletion.success) {
                removedFromMeta.push(platform);
                nextResults[platform] = { ...result, deleted: true, deletedAt: new Date().toISOString() };
            } else {
                remaining.push({ platform, reason: deletion.error });
            }
        }

        // Everything that was live is gone — the history row can go too.
        if (remaining.length === 0) {
            if (!await dropRow()) {
                return res.status(409).json({
                    error: 'This post changed while you were deleting it. Reload and try again.'
                });
            }
            return res.json({
                success: true,
                removedFromMeta,
                message: `Deleted from ${removedFromMeta.join(' and ')}`
            });
        }

        // Something is still up on Meta. Keep the row so history stays honest,
        // but record the parts we did manage to delete.
        await supabase
            .from('scheduled_posts')
            .update({ publish_results: nextResults, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('workspace_id', req.workspaceId);

        return res.status(409).json({
            success: false,
            removedFromMeta,
            remaining,
            error: remaining.map((r) => r.reason).join(' ')
        });

    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Engagement for the posts this app published
 * GET /api/meta/posts/metrics?limit=20
 *
 * Reads the user's own publish history and asks Meta for each post's counts,
 * so the numbers line up with Post History rather than with everything that
 * happens to be on the connected Instagram account.
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
            // Meta rows only -- a LinkedIn row has no Page token to resolve.
            // Its metrics come from GET /api/linkedin/posts/metrics.
            .eq('provider', 'meta')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        if (!posts || posts.length === 0) return res.json({ success: true, posts: [] });

        // One Page token per Page, not per post
        const tokenCache = new Map();
        const pageToken = async (pageId) => {
            if (!tokenCache.has(pageId)) {
                const r = await ctx.metaService.getPageToken(pageId);
                tokenCache.set(pageId, r.success ? r.pageAccessToken : null);
            }
            return tokenCache.get(pageId);
        };

        const enriched = await Promise.all(posts.map(async (post) => {
            const token = await pageToken(post.page_id);
            const results = post.publish_results || {};
            const metrics = {};

            for (const [platform, r] of Object.entries(results)) {
                if (!r?.success || !r.postId || !token) continue;
                const m = await ctx.metaService.getPostMetrics(platform, r.postId, token);
                // A deleted post returns an error; report it rather than a zero
                metrics[platform] = m.success
                    ? m.metrics
                    : { unavailable: true, error: m.error };
            }

            return {
                id: post.id,
                content: post.content,
                pageName: post.page_name,
                platforms: post.platforms || ['facebook'],
                publishedAt: post.published_at,
                mediaUrl: (post.media_urls || [])[0] || null,
                metrics
            };
        }));

        res.json({ success: true, posts: enriched });

    } catch (error) {
        console.error('Post metrics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== META PLATFORM CALLBACKS ====================

/**
 * Deauthorize Callback
 * POST /api/meta/deauthorize
 *
 * Meta calls this when a person removes the app from their Facebook settings.
 * Configure the URL in App Dashboard -> Facebook Login -> Settings.
 */
router.post('/deauthorize', async (req, res) => {
    try {
        const decoded = parseSignedRequest(req.body?.signed_request);

        if (!decoded?.user_id) {
            return res.status(400).json({ error: 'Invalid signed_request' });
        }

        const removed = await purgeMetaUser(decoded.user_id);
        console.log(`[Meta] Deauthorize for ${decoded.user_id} — removed ${removed} connection(s)`);

        res.json({ success: true });
    } catch (error) {
        console.error('Deauthorize callback error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Data Deletion Request Callback
 * POST /api/meta/data-deletion
 *
 * Meta calls this when a person requests deletion of their data. It must
 * respond with a status URL and a confirmation code so the person can check
 * on the request. Configure in App Dashboard -> Settings -> Basic.
 */
router.post('/data-deletion', async (req, res) => {
    try {
        const decoded = parseSignedRequest(req.body?.signed_request);

        if (!decoded?.user_id) {
            return res.status(400).json({ error: 'Invalid signed_request' });
        }

        const removed = await purgeMetaUser(decoded.user_id);

        // Deterministic per-user code so a repeat request returns the same one
        const confirmationCode = crypto
            .createHash('sha256')
            .update(`${decoded.user_id}:${META_APP_SECRET}`)
            .digest('hex')
            .slice(0, 16);

        console.log(`[Meta] Data deletion for ${decoded.user_id} — removed ${removed} connection(s), code ${confirmationCode}`);

        res.json({
            url: returnUrl(`data_deletion=${confirmationCode}`),
            confirmation_code: confirmationCode
        });
    } catch (error) {
        console.error('Data deletion callback error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
