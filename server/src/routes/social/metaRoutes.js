/**
 * Meta (Facebook / Instagram) API Routes
 *
 * Handles Meta account connection, Facebook Page + Instagram publishing,
 * post scheduling and ad campaign reporting — all through the official
 * Meta Graph API.
 */

import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import MetaService from '../../services/social/metaService.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { encryptData, decryptData } from '../../../utils/encryption.js';

const router = express.Router();

// Configure Multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB — Instagram video/reels need headroom
    }
});

// Initialize Supabase with service role key to bypass RLS
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Meta App Config
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:3001/api/meta/oauth/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Where the OAuth callback bounces the browser back to. Must be a real client
// route — MetaAdsPage reads ?oauth_success / ?token / ?error from it.
const META_RETURN_PATH = process.env.META_RETURN_PATH || '/dashboard/agents/meta';
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

    const userIds = connections.map((c) => c.user_id);

    // Scheduled posts reference the connection; clear them first
    await supabase.from('scheduled_posts').delete().in('user_id', userIds);
    await supabase.from('meta_connections').delete().eq('meta_user_id', metaUserId);

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
        .eq('user_id', req.user.id)
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
const handleMetaError = async (res, userId, errorResult) => {
    if (errorResult.code === 190 || errorResult.code === 463 || errorResult.code === 467) {
        console.log(`🔒 [Meta] Token expired/invalid (Code ${errorResult.code}) for user ${userId}. Deactivating connection.`);

        await supabase
            .from('meta_connections')
            .update({ is_active: false })
            .eq('user_id', userId);

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
router.post('/posts/upload-media', upload.array('files'), async (req, res) => {
    try {
        const userId = req.user.id;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedUrls = [];

        for (const file of files) {
            const filename = `${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '')}`;

            const { error } = await supabase
                .storage
                .from('post-media')
                .upload(filename, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (error) {
                console.error('Supabase upload error:', error);
                throw error;
            }

            const { data: { publicUrl } } = supabase
                .storage
                .from('post-media')
                .getPublicUrl(filename);

            uploadedUrls.push(publicUrl);
        }

        res.json({ success: true, urls: uploadedUrls });

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
        const adAccountsResult = await metaService.getAdAccounts();
        console.log(`✅ [Meta Connect] Pages: ${pagesResult.success ? pagesResult.pages?.length : 'failed'}, AdAccounts: ${adAccountsResult.success ? adAccountsResult.adAccounts?.length : 'failed'}`);

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
            .select('whatsapp_phone_id, waba_id')
            .eq('user_id', userId)
            .single();

        const { error } = await supabase
            .from('meta_connections')
            .upsert({
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
                ad_accounts: adAccountsResult.success ? adAccountsResult.adAccounts : [],
                is_active: true,
                // Preserve existing WhatsApp config if present
                whatsapp_phone_id: existingConn?.whatsapp_phone_id || null,
                waba_id: existingConn?.waba_id || null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
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
            adAccounts: adAccountsResult.success ? adAccountsResult.adAccounts : [],
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
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!connection) {
            return res.json({ connected: false });
        }

        const decryptedToken = decryptData(connection.access_token);
        const metaService = new MetaService(decryptedToken);
        const validation = await metaService.validateToken();

        const pages = connection.pages || [];

        res.json({
            connected: true,
            isValid: validation.isValid,
            grantedScopes: validation.scopes || [],
            expiresAt: connection.token_expires_at,
            pages,
            // Instagram Business accounts reachable through the connected pages
            instagramAccounts: pages
                .filter((p) => p.instagram_business_account?.id)
                .map((p) => ({
                    ...p.instagram_business_account,
                    pageId: p.id,
                    pageName: p.name
                })),
            adAccounts: connection.ad_accounts || [],
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
            .eq('user_id', userId);

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
        const adAccountsResult = await metaService.getAdAccounts();

        const { error: updateError } = await supabase
            .from('meta_connections')
            .update({
                pages: pagesResult.success ? pagesResult.pages : connection.pages,
                ad_accounts: adAccountsResult.success ? adAccountsResult.adAccounts : connection.ad_accounts,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', req.user.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            pages: pagesResult.success ? pagesResult.pages : [],
            adAccounts: adAccountsResult.success ? adAccountsResult.adAccounts : []
        });

    } catch (error) {
        console.error('Refresh accounts error:', error);
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
            return handleMetaError(res, req.user.id, pagesResult);
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
            return handleMetaError(res, req.user.id, tokenResult);
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
            return handleMetaError(res, req.user.id, media);
        }

        res.json({ success: true, account: igResult.instagramAccount, media: media.data.data || [] });

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
            return handleMetaError(res, req.user.id, tokenResult);
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

        const { data: connection, error: connError } = await supabase
            .from('meta_connections')
            .select('*')
            .eq('user_id', userId)
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
            .eq('user_id', userId)
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
 * Cancel/Delete a scheduled post
 * DELETE /api/meta/posts/:id
 */
router.delete('/posts/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const { error } = await supabase
            .from('scheduled_posts')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .eq('status', 'pending'); // Can only delete pending posts

        if (error) throw error;

        res.json({ success: true, message: 'Scheduled post deleted' });

    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CAMPAIGN ROUTES ====================

/**
 * Get campaigns with insights
 * GET /api/meta/campaigns
 */
router.get('/campaigns', async (req, res) => {
    try {
        const { adAccountId, datePreset = 'last_30d' } = req.query;

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const { connection, metaService } = ctx;

        const targetAdAccountId = adAccountId ||
            (connection.ad_accounts && connection.ad_accounts[0]?.account_id);

        if (!targetAdAccountId) {
            return res.json({ success: true, campaigns: [], message: 'No ad accounts found' });
        }

        const campaignsResult = await metaService.getCampaigns(targetAdAccountId);

        if (!campaignsResult.success) {
            return handleMetaError(res, req.user.id, campaignsResult);
        }

        const campaignsWithInsights = await Promise.all(
            (campaignsResult.data.data || []).map(async (campaign) => {
                const insightsResult = await metaService.getCampaignInsights(campaign.id, datePreset);
                return {
                    ...campaign,
                    insights: insightsResult.success ? (insightsResult.data.data?.[0] || {}) : {}
                };
            })
        );

        res.json({
            success: true,
            campaigns: campaignsWithInsights,
            adAccountId: targetAdAccountId
        });

    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get aggregated ad account insights
 * GET /api/meta/insights
 */
router.get('/insights', async (req, res) => {
    try {
        const { adAccountId, datePreset = 'last_30d' } = req.query;

        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const { connection, metaService } = ctx;

        const targetAdAccountId = adAccountId ||
            (connection.ad_accounts && connection.ad_accounts[0]?.account_id);

        if (!targetAdAccountId) {
            return res.json({ success: true, insights: {}, message: 'No ad accounts found' });
        }

        const insightsResult = await metaService.getAdAccountInsights(targetAdAccountId, datePreset);

        if (!insightsResult.success) {
            return handleMetaError(res, req.user.id, insightsResult);
        }

        res.json({
            success: true,
            insights: insightsResult.data.data?.[0] || {},
            adAccountId: targetAdAccountId
        });

    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get live ad account balance & spend
 * GET /api/meta/account-balance
 */
router.get('/account-balance', async (req, res) => {
    try {
        const ctx = await loadConnection(req, res);
        if (!ctx) return;

        const adAccountsResult = await ctx.metaService.getAdAccounts();

        if (!adAccountsResult.success) {
            return handleMetaError(res, req.user.id, adAccountsResult);
        }

        const accounts = adAccountsResult.adAccounts || [];

        if (accounts.length === 0) {
            return res.json({ success: true, accounts: [], message: 'No ad accounts found' });
        }

        // Meta returns amounts in the account currency's minor units (cents)
        const formattedAccounts = accounts.map((acc) => ({
            account_id: acc.account_id,
            name: acc.name,
            currency: acc.currency || 'USD',
            account_status: acc.account_status, // 1=Active, 2=Disabled, 3=Unsettled, etc.
            balance: acc.balance ? (parseFloat(acc.balance) / 100).toFixed(2) : '0.00',
            amount_spent: acc.amount_spent ? (parseFloat(acc.amount_spent) / 100).toFixed(2) : '0.00',
        }));

        await supabase
            .from('meta_connections')
            .update({ ad_accounts: accounts, updated_at: new Date().toISOString() })
            .eq('user_id', req.user.id);

        res.json({ success: true, accounts: formattedAccounts });

    } catch (error) {
        console.error('Get account balance error:', error);
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
