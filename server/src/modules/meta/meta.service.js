/**
 * Meta Graph API Service
 *
 * Official Meta Graph API client. Covers Facebook Page publishing and
 * Instagram Content Publishing. Every request goes to graph.facebook.com —
 * there is no third-party relay in this path.
 *
 * Ads and the Conversions API are out of scope — see DEFAULT_SCOPES.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import axios from 'axios';

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Instagram video containers are processed asynchronously — poll until FINISHED.
const IG_STATUS_POLL_INTERVAL_MS = 3000;
const IG_STATUS_MAX_ATTEMPTS = 40; // ~2 minutes

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.webm'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Best-effort media type detection from a public URL.
 */
const isVideoUrl = (url = '') => {
    const path = String(url).split('?')[0].toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
};

class MetaService {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.client = axios.create({
            baseURL: META_GRAPH_URL,
            timeout: 60000,
        });
    }

    /**
     * Make authenticated API request
     */
    async request(method, endpoint, data = {}, params = {}) {
        try {
            const config = {
                method,
                url: endpoint,
                params: {
                    access_token: this.accessToken,
                    ...params
                }
            };

            if (method === 'POST' || method === 'PUT') {
                config.data = data;
            }

            const response = await this.client.request(config);
            return { success: true, data: response.data };
        } catch (error) {
            console.error(`Meta API Error [${endpoint}]:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message,
                code: error.response?.data?.error?.code
            };
        }
    }

    // ==================== ACCOUNT METHODS ====================

    /**
     * Get current user profile
     */
    async getMe() {
        return this.request('GET', '/me', {}, {
            fields: 'id,name,email,picture'
        });
    }

    /**
     * Get user's Facebook Pages, including any linked Instagram Business account.
     */
    async getPages() {
        const result = await this.request('GET', '/me/accounts', {}, {
            fields: 'id,name,access_token,category,picture,fan_count,instagram_business_account{id,username,profile_picture_url,followers_count}'
        });

        if (result.success && result.data.data) {
            return { success: true, pages: result.data.data };
        }
        return result;
    }

    /**
     * Validate access token
     */
    async validateToken() {
        const result = await this.request('GET', '/debug_token', {}, {
            input_token: this.accessToken
        });

        if (result.success && result.data.data) {
            return {
                success: true,
                isValid: result.data.data.is_valid,
                expiresAt: result.data.data.expires_at ? new Date(result.data.data.expires_at * 1000) : null,
                scopes: result.data.data.scopes || []
            };
        }
        return { success: false, isValid: false };
    }

    /**
     * Resolve the Page access token for a given page id using the current
     * (user) token. Publishing as a Page requires the Page token, not the
     * user token.
     */
    async getPageToken(pageId) {
        const pagesResult = await this.getPages();
        if (!pagesResult.success) {
            return { success: false, error: pagesResult.error || 'Failed to list pages', code: pagesResult.code };
        }

        const page = (pagesResult.pages || []).find((p) => String(p.id) === String(pageId));
        if (!page) {
            return { success: false, error: `Page ${pageId} is not available on this Meta connection` };
        }
        if (!page.access_token) {
            return { success: false, error: `No page access token returned for ${page.name || pageId}. Re-grant pages_manage_posts.` };
        }

        return { success: true, page, pageAccessToken: page.access_token };
    }

    // ==================== POST HISTORY (live, from the platform) ====================

    /**
     * Every published post on a Page — including posts made natively on
     * Facebook, not just ones created through this app. Reads with the PAGE
     * token (published_posts requires it).
     */
    async getPageFeed(pageId, pageName, pageAccessToken, limit = 25) {
        const pageApi = new MetaService(pageAccessToken);
        const result = await pageApi.request('GET', `/${pageId}/published_posts`, {}, {
            fields: 'id,message,created_time,permalink_url,full_picture,likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
            limit,
        });
        if (!result.success) return result;

        return {
            success: true,
            posts: (result.data.data || []).map((p) => ({
                id: p.id,
                platform: 'facebook',
                pageId,
                pageName,
                message: p.message || '',
                mediaUrl: p.full_picture || null,
                permalink: p.permalink_url || null,
                publishedAt: p.created_time,
                likes: p.likes?.summary?.total_count ?? null,
                comments: p.comments?.summary?.total_count ?? null,
                shares: p.shares?.count ?? null,
            })),
        };
    }

    /** All media on a linked Instagram Business account, same page token. */
    async getInstagramFeed(igUserId, igUsername, pageAccessToken, limit = 25) {
        const pageApi = new MetaService(pageAccessToken);
        const result = await pageApi.request('GET', `/${igUserId}/media`, {}, {
            fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
            limit,
        });
        if (!result.success) return result;

        return {
            success: true,
            posts: (result.data.data || []).map((m) => ({
                id: m.id,
                platform: 'instagram',
                pageId: igUserId,
                pageName: igUsername ? `@${igUsername}` : 'Instagram',
                message: m.caption || '',
                mediaUrl: m.thumbnail_url || m.media_url || null,
                permalink: m.permalink || null,
                publishedAt: m.timestamp,
                likes: m.like_count ?? null,
                comments: m.comments_count ?? null,
                shares: null,
            })),
        };
    }

    // ==================== FACEBOOK PAGE POST METHODS ====================

    /**
     * Publish a post to a Facebook Page.
     * Supports text, link, single photo/video and multi-photo (carousel) posts.
     */
    async publishPost(pageId, pageAccessToken, { message, link, mediaUrls }) {
        const service = new MetaService(pageAccessToken);
        const media = (mediaUrls || []).filter(Boolean);

        // Single video → /videos
        if (media.length === 1 && isVideoUrl(media[0])) {
            return service.request('POST', `/${pageId}/videos`, {
                description: message,
                file_url: media[0]
            });
        }

        // Single image → /photos publishes directly with a caption
        if (media.length === 1) {
            return service.request('POST', `/${pageId}/photos`, {
                caption: message,
                url: media[0]
            });
        }

        // Multiple images → upload each unpublished, then attach to one feed post
        if (media.length > 1) {
            const attached = [];
            for (const url of media) {
                const uploaded = await service.request('POST', `/${pageId}/photos`, {
                    url,
                    published: false
                });
                if (!uploaded.success) {
                    return uploaded;
                }
                attached.push({ media_fbid: uploaded.data.id });
            }

            const postData = { message, attached_media: attached };
            if (link) postData.link = link;
            return service.request('POST', `/${pageId}/feed`, postData);
        }

        // Text / link only
        const postData = { message };
        if (link) postData.link = link;
        return service.request('POST', `/${pageId}/feed`, postData);
    }

    /**
     * Delete a published Facebook Page post.
     *
     * Covered by pages_manage_posts. Works for both feed posts and the photo
     * nodes that single-image publishes return.
     *
     * Instagram has no counterpart — the Graph API exposes no delete for
     * media, so IG posts can only be removed in the Instagram app.
     */
    async deletePost(postId, pageAccessToken) {
        const service = new MetaService(pageAccessToken || this.accessToken);
        return service.request('DELETE', `/${postId}`);
    }

    /**
     * Schedule a post natively on a Facebook Page.
     * Meta requires the time to be 10 minutes – 75 days in the future.
     */
    async schedulePost(pageId, pageAccessToken, { message, link, scheduledTime }) {
        const service = new MetaService(pageAccessToken);

        const postData = {
            message,
            published: false,
            scheduled_publish_time: Math.floor(new Date(scheduledTime).getTime() / 1000)
        };
        if (link) postData.link = link;

        return service.request('POST', `/${pageId}/feed`, postData);
    }

    /**
     * Get natively-scheduled posts for a page
     */
    async getScheduledPosts(pageId, pageAccessToken) {
        const service = new MetaService(pageAccessToken);
        return service.request('GET', `/${pageId}/scheduled_posts`, {}, {
            fields: 'id,message,scheduled_publish_time,created_time'
        });
    }

    // ==================== INSTAGRAM PUBLISHING METHODS ====================

    /**
     * Get the Instagram Business account linked to a Page.
     */
    async getInstagramAccount(pageId, pageAccessToken) {
        const service = new MetaService(pageAccessToken || this.accessToken);
        const result = await service.request('GET', `/${pageId}`, {}, {
            fields: 'instagram_business_account{id,username,profile_picture_url,followers_count}'
        });

        if (!result.success) return result;

        const igAccount = result.data?.instagram_business_account;
        if (!igAccount?.id) {
            return {
                success: false,
                error: 'No Instagram Business account is linked to this Facebook Page. Link one in Meta Business Suite.'
            };
        }

        return { success: true, instagramAccount: igAccount };
    }

    /**
     * Poll an Instagram media container until it finishes processing.
     * Images are usually immediate; videos/reels take several seconds.
     */
    async waitForContainer(containerId) {
        for (let attempt = 0; attempt < IG_STATUS_MAX_ATTEMPTS; attempt++) {
            const status = await this.request('GET', `/${containerId}`, {}, {
                fields: 'status_code,status'
            });

            if (!status.success) return status;

            const code = status.data?.status_code;
            if (code === 'FINISHED') return { success: true, data: status.data };
            if (code === 'ERROR' || code === 'EXPIRED') {
                return {
                    success: false,
                    error: `Instagram media processing ${code}: ${status.data?.status || 'no detail'}`
                };
            }

            await sleep(IG_STATUS_POLL_INTERVAL_MS);
        }

        return { success: false, error: 'Timed out waiting for Instagram media to finish processing' };
    }

    /**
     * Create a single Instagram media container.
     */
    async createInstagramContainer(igUserId, { url, caption, isCarouselItem = false }) {
        const payload = {};

        if (isVideoUrl(url)) {
            payload.media_type = 'REELS';
            payload.video_url = url;
        } else {
            payload.image_url = url;
        }

        if (isCarouselItem) {
            payload.is_carousel_item = true;
        } else if (caption) {
            payload.caption = caption;
        }

        return this.request('POST', `/${igUserId}/media`, payload);
    }

    /**
     * Publish to an Instagram Business account using the official
     * Content Publishing API: create container(s) → publish.
     *
     * Instagram requires at least one image or video — text-only posts are
     * not supported by the API.
     */
    async publishInstagramPost(igUserId, pageAccessToken, { caption, mediaUrls }) {
        const service = new MetaService(pageAccessToken);
        const media = (mediaUrls || []).filter(Boolean);

        if (media.length === 0) {
            return {
                success: false,
                error: 'Instagram posts require at least one image or video. Text-only posts are not supported by the Instagram API.'
            };
        }

        if (media.length > 10) {
            return { success: false, error: 'Instagram carousels support a maximum of 10 items.' };
        }

        let creationId;

        if (media.length === 1) {
            const container = await service.createInstagramContainer(igUserId, { url: media[0], caption });
            if (!container.success) return container;
            creationId = container.data.id;
        } else {
            // Carousel: each child first, then the parent container
            const childIds = [];
            for (const url of media) {
                const child = await service.createInstagramContainer(igUserId, { url, isCarouselItem: true });
                if (!child.success) return child;

                if (isVideoUrl(url)) {
                    const ready = await service.waitForContainer(child.data.id);
                    if (!ready.success) return ready;
                }
                childIds.push(child.data.id);
            }

            const parent = await service.request('POST', `/${igUserId}/media`, {
                media_type: 'CAROUSEL',
                children: childIds.join(','),
                ...(caption ? { caption } : {})
            });
            if (!parent.success) return parent;
            creationId = parent.data.id;
        }

        // Wait for processing (returns immediately for already-finished images)
        const ready = await service.waitForContainer(creationId);
        if (!ready.success) return ready;

        return service.request('POST', `/${igUserId}/media_publish`, { creation_id: creationId });
    }

    /**
     * Recent Instagram media for an account.
     */
    async getInstagramMedia(igUserId, pageAccessToken, limit = 25) {
        const service = new MetaService(pageAccessToken || this.accessToken);
        return service.request('GET', `/${igUserId}/media`, {}, {
            fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count',
            limit
        });
    }

    /**
     * Engagement for one published post.
     *
     * Facebook exposes reaction/comment/share counts on the Page post itself;
     * Instagram exposes like_count / comments_count on the media node. Both
     * are covered by pages_read_engagement / instagram_basic — no ads or
     * insights permissions involved.
     */
    async getPostMetrics(platform, postId, pageAccessToken) {
        const service = new MetaService(pageAccessToken || this.accessToken);

        if (platform === 'instagram') {
            const r = await service.request('GET', `/${postId}`, {}, {
                fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
            });
            if (!r.success) return r;
            const m = r.data || {};
            return {
                success: true,
                metrics: {
                    likes: m.like_count ?? null,
                    comments: m.comments_count ?? null,
                    shares: null,
                    permalink: m.permalink || null,
                    thumbnail: m.thumbnail_url || m.media_url || null,
                    publishedAt: m.timestamp || null
                }
            };
        }

        // A single-image post is published via /{page}/photos, so the id we
        // stored is a photo node — it has `link`/`picture` and no
        // `permalink_url` or `shares`. Try the feed-post shape, then fall back.
        const COUNTS = 'likes.summary(true).limit(0),comments.summary(true).limit(0)';

        let r = await service.request('GET', `/${postId}`, {}, {
            fields: `id,created_time,permalink_url,full_picture,shares,${COUNTS}`
        });

        if (!r.success && r.code === 100) {
            r = await service.request('GET', `/${postId}`, {}, {
                fields: `id,created_time,link,picture,${COUNTS}`
            });
        }

        if (!r.success) return r;
        const d = r.data || {};
        return {
            success: true,
            metrics: {
                likes: d.likes?.summary?.total_count ?? null,
                comments: d.comments?.summary?.total_count ?? null,
                shares: d.shares?.count ?? 0,
                permalink: d.permalink_url || d.link || null,
                thumbnail: d.full_picture || d.picture || null,
                publishedAt: d.created_time || null
            }
        };
    }

    /**
     * Remaining Instagram publishing quota (25 posts / 24h per account).
     */
    async getInstagramPublishingLimit(igUserId, pageAccessToken) {
        const service = new MetaService(pageAccessToken || this.accessToken);
        return service.request('GET', `/${igUserId}/content_publishing_limit`, {}, {
            fields: 'config,quota_usage'
        });
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Exchange short-lived token for long-lived token
     */
    static async exchangeToken(shortLivedToken, appId, appSecret) {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: appId,
                    client_secret: appSecret,
                    fb_exchange_token: shortLivedToken
                }
            });

            return {
                success: true,
                accessToken: response.data.access_token,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            console.error('Token exchange error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }

    /**
     * Default permission set requested at OAuth time. These are the official
     * Meta permissions the platform is reviewed for.
     */
    static get DEFAULT_SCOPES() {
        // Only permissions this app can actually demonstrate in App Review.
        // Requesting anything we cannot screencast gets that permission
        // rejected, so messaging/comments scopes are deliberately absent
        // until those features exist.
        return [
            'pages_show_list',          // list Pages -> find linked IG account
            'pages_read_engagement',    // read Page fields
            'pages_manage_posts',       // publish to a Facebook Page
            'instagram_basic',          // read IG profile + media
            'instagram_content_publish' // publish to IG Business account
        ];
    }

    /**
     * Generate OAuth authorization URL
     */
    static getOAuthUrl(appId, redirectUri, scope, state) {
        const scopes = scope || MetaService.DEFAULT_SCOPES;

        const params = new URLSearchParams({
            client_id: appId,
            redirect_uri: redirectUri,
            scope: scopes.join(','),
            response_type: 'code',
            state: state || generateState()
        });

        return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
    }

    /**
     * Exchange OAuth code for access token
     */
    static async exchangeCodeForToken(code, appId, appSecret, redirectUri) {
        try {
            const response = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
                params: {
                    client_id: appId,
                    client_secret: appSecret,
                    redirect_uri: redirectUri,
                    code
                }
            });

            return {
                success: true,
                accessToken: response.data.access_token,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            console.error('OAuth code exchange error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.message || error.message
            };
        }
    }
}

/**
 * Generate random state for OAuth CSRF protection
 */
function generateState() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default MetaService;
export { MetaService, META_API_VERSION, META_GRAPH_URL, isVideoUrl };
