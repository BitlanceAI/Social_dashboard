/**
 * LinkedIn API Service
 *
 * Official LinkedIn REST API client. Covers member and organization
 * publishing, media upload and post deletion. Every request goes to
 * api.linkedin.com — there is no third-party relay in this path.
 *
 * Three things differ materially from MetaService and drive the design here:
 *
 *  1. Auth is a Bearer header, not a query param, and every versioned /rest
 *     call additionally requires LinkedIn-Version and X-Restli-Protocol-Version.
 *     A missing or sunset version header is an error — LinkedIn never falls
 *     back to "latest".
 *  2. Creating a post returns 201 with an EMPTY body. The new post's URN
 *     arrives in the `x-restli-id` response header and nowhere else.
 *  3. LinkedIn will not fetch media by URL the way Meta does. We have to
 *     initialize an upload, pull the bytes down ourselves, and PUT them.
 *
 * There is no native scheduling: lifecycleState accepts only PUBLISHED on
 * create, so modules/scheduler does the real work for timed posts.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import axios from 'axios';

// Single source of truth for the version header. LinkedIn supports a given
// version for a minimum of one year and then rejects it outright, so this
// needs a calendar reminder, not a scramble. Never inline the YYYYMM string.
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || '202608';

const LINKEDIN_REST_URL = 'https://api.linkedin.com/rest';
const LINKEDIN_V2_URL = 'https://api.linkedin.com/v2';
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// LinkedIn treats these as markup in `commentary` (its "Little Text Format").
// An unescaped bracket or @ in ordinary prose fails the create with a 422,
// which is the single most common first-run surprise.
const LITTLE_TEXT_RESERVED = /([\\()[\]{}<>@|~_*#])/g;

const escapeCommentary = (text = '') => String(text).replace(LITTLE_TEXT_RESERVED, '\\$1');

// Media processing is asynchronous; mirrors the bounded-poll shape used by
// MetaService.waitForContainer rather than inventing a second idiom.
const VIDEO_STATUS_POLL_INTERVAL_MS = 3000;
const VIDEO_STATUS_MAX_ATTEMPTS = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Kept local rather than imported from meta.service.js so this module does
// not depend on the Meta one.
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
function isVideoUrl(url = '') {
    const clean = String(url).split('?')[0].toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

/** URNs in a URL path must be percent-encoded; commas inside List(...) must not. */
const encodeUrn = (urn) => encodeURIComponent(urn);

class LinkedInService {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.client = axios.create({ baseURL: LINKEDIN_REST_URL, timeout: 60000 });
    }

    get headers() {
        return {
            Authorization: `Bearer ${this.accessToken}`,
            'LinkedIn-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
        };
    }

    /**
     * Generic request. The envelope deliberately matches MetaService.request
     * — {success, data} / {success, error, code} — so callers and the
     * scheduler read identically for both providers. Two fields are added
     * that Meta has no use for:
     *
     *   id      the `x-restli-id` header, the ONLY place a created post's URN
     *           appears (201 responses have no body)
     *   status  the HTTP status, needed to tell a revoked token (401) from
     *           "needs Community Management approval" (403)
     */
    async request(method, endpoint, data = {}, params = {}, opts = {}) {
        try {
            const config = {
                method,
                url: endpoint,
                params,
                headers: { ...this.headers, ...(opts.headers || {}) },
            };

            if (method === 'POST' || method === 'PUT') {
                config.data = data;
            }

            const response = await this.client.request(config);

            return {
                success: true,
                data: response.data ?? null,
                id: response.headers?.['x-restli-id'] || null,
                status: response.status,
            };
        } catch (error) {
            const body = error.response?.data;
            console.error(`LinkedIn API Error [${endpoint}]:`, body || error.message);
            return {
                success: false,
                // LinkedIn errors: { status, code, serviceErrorCode, message }
                error: body?.message || error.message,
                code: body?.serviceErrorCode ?? body?.code ?? null,
                status: error.response?.status ?? null,
            };
        }
    }

    // ==================== IDENTITY ====================

    /**
     * The authenticated member, via OpenID Connect.
     *
     * /v2/userinfo is the self-serve path and is NOT a versioned endpoint —
     * it takes the bearer token but must not carry LinkedIn-Version. /v2/me
     * is deliberately avoided: the Profile API is restricted to approved
     * developers.
     */
    async getUserInfo() {
        try {
            const response = await axios.get(`${LINKEDIN_V2_URL}/userinfo`, {
                headers: { Authorization: `Bearer ${this.accessToken}` },
                timeout: 30000,
            });

            const d = response.data || {};
            return {
                success: true,
                sub: d.sub,
                authorUrn: d.sub ? `urn:li:person:${d.sub}` : null,
                name: d.name || [d.given_name, d.family_name].filter(Boolean).join(' '),
                picture: d.picture || null,
                email: d.email || null,
            };
        } catch (error) {
            const body = error.response?.data;
            return {
                success: false,
                error: body?.message || error.message,
                code: body?.serviceErrorCode ?? null,
                status: error.response?.status ?? null,
            };
        }
    }

    /**
     * Organizations this member administers.
     *
     * DORMANT until the Community Management API review grants
     * rw_organization_admin. Returning early without an HTTP call keeps the
     * code path live and testable while burning none of the Development-tier
     * budget (500 calls/app/day) on a request that can only 403.
     */
    async getOrganizations(grantedScopes = []) {
        if (!grantedScopes.includes('rw_organization_admin')) {
            return { success: true, organizations: [], dormant: true };
        }

        const result = await this.request('GET', '/organizationAcls', {}, {
            q: 'roleAssignee',
            role: 'ADMINISTRATOR',
            state: 'APPROVED',
            projection: '(elements*(organization~(id,localizedName,logoV2)))',
        });

        if (!result.success) return result;

        const organizations = (result.data?.elements || []).map((el) => {
            const org = el['organization~'] || {};
            return {
                urn: el.organization,
                id: org.id ?? null,
                name: org.localizedName || 'LinkedIn Page',
            };
        });

        return { success: true, organizations };
    }

    // ==================== MEDIA ====================

    /**
     * Upload one image and return its URN.
     *
     * This is the inversion of the Meta model. Meta is handed a public
     * post-media URL and fetches it itself; LinkedIn requires the bytes, so
     * we pull them down and PUT them. That is also why the post-media bucket
     * has to stay public — we read it back over plain HTTPS.
     */
    async uploadImage(ownerUrn, mediaUrl) {
        const init = await this.request(
            'POST',
            '/images',
            { initializeUploadRequest: { owner: ownerUrn } },
            { action: 'initializeUpload' },
        );

        if (!init.success) return init;

        const uploadUrl = init.data?.value?.uploadUrl;
        const imageUrn = init.data?.value?.image;

        if (!uploadUrl || !imageUrn) {
            return { success: false, error: 'LinkedIn did not return an image upload URL' };
        }

        try {
            const source = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            await axios.put(uploadUrl, source.data, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': source.headers?.['content-type'] || 'application/octet-stream',
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 120000,
            });

            return { success: true, imageUrn };
        } catch (error) {
            return {
                success: false,
                error: `Image upload failed: ${error.response?.data?.message || error.message}`,
            };
        }
    }

    /**
     * Upload one video: initialize, PUT each <=4MB part capturing its etag,
     * finalize with the parts in order, then wait for transcoding.
     */
    async uploadVideo(ownerUrn, mediaUrl) {
        let source;
        try {
            source = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 120000 });
        } catch (error) {
            return { success: false, error: `Could not read video: ${error.message}` };
        }

        const buffer = Buffer.from(source.data);

        const init = await this.request(
            'POST',
            '/videos',
            {
                initializeUploadRequest: {
                    owner: ownerUrn,
                    fileSizeBytes: buffer.length,
                    uploadCaptions: false,
                    uploadThumbnail: false,
                },
            },
            { action: 'initializeUpload' },
        );

        if (!init.success) return init;

        const value = init.data?.value || {};
        const videoUrn = value.video;
        const instructions = value.uploadInstructions || [];
        const uploadToken = value.uploadToken ?? '';

        if (!videoUrn || instructions.length === 0) {
            return { success: false, error: 'LinkedIn did not return video upload instructions' };
        }

        // Order matters: finalizeUpload matches uploadedPartIds positionally
        // against uploadInstructions.
        const uploadedPartIds = [];
        try {
            for (const part of instructions) {
                const chunk = buffer.subarray(part.firstByte, part.lastByte + 1);
                const res = await axios.put(part.uploadUrl, chunk, {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/octet-stream',
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 120000,
                });

                const etag = res.headers?.etag || res.headers?.ETag;
                if (!etag) throw new Error('Upload part returned no etag');
                uploadedPartIds.push(etag);
            }
        } catch (error) {
            return { success: false, error: `Video upload failed: ${error.message}` };
        }

        const finalize = await this.request(
            'POST',
            '/videos',
            { finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds } },
            { action: 'finalizeUpload' },
        );

        if (!finalize.success) return finalize;

        const ready = await this.waitForVideo(videoUrn);
        if (!ready.success) return ready;

        return { success: true, videoUrn };
    }

    /** Poll a video until LinkedIn finishes transcoding it. */
    async waitForVideo(videoUrn) {
        for (let attempt = 0; attempt < VIDEO_STATUS_MAX_ATTEMPTS; attempt++) {
            const result = await this.request('GET', `/videos/${encodeUrn(videoUrn)}`);
            if (!result.success) return result;

            const status = result.data?.status;
            if (status === 'AVAILABLE') return { success: true };
            if (status === 'PROCESSING_FAILED') {
                return { success: false, error: 'LinkedIn failed to process the video' };
            }

            await sleep(VIDEO_STATUS_POLL_INTERVAL_MS);
        }

        return { success: false, error: 'Timed out waiting for LinkedIn to process the video' };
    }

    // ==================== PUBLISHING ====================

    /**
     * Publish a post.
     *
     * The body is identical for a member and an organization — only the
     * `author` URN changes. That is what makes the organization path cheap
     * to keep dormant.
     */
    async publishPost(authorUrn, {
        commentary,
        mediaUrls = [],
        linkUrl,
        altText,
        linkTitle,
        linkDescription,
    } = {}) {
        const body = {
            author: authorUrn,
            commentary: escapeCommentary(commentary),
            visibility: 'PUBLIC',
            distribution: {
                feedDistribution: 'MAIN_FEED',
                targetEntities: [],
                thirdPartyDistributionChannels: [],
            },
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false,
        };

        const media = (mediaUrls || []).filter(Boolean);

        if (media.length > 0) {
            const upload = isVideoUrl(media[0])
                ? await this.uploadVideo(authorUrn, media[0])
                : await this.uploadImage(authorUrn, media[0]);

            if (!upload.success) return upload;

            body.content = {
                media: {
                    id: upload.imageUrn || upload.videoUrn,
                    ...(altText ? { altText } : {}),
                },
            };
        } else if (linkUrl) {
            // LinkedIn does NOT scrape the URL for a title/description/thumbnail
            // the way Meta does — whatever we omit here renders blank.
            body.content = {
                article: {
                    source: linkUrl,
                    title: linkTitle || linkUrl,
                    ...(linkDescription ? { description: linkDescription } : {}),
                },
            };
        }

        const result = await this.request('POST', '/posts', body);
        if (!result.success) return result;

        // 201 Created has no body: the URN is in the x-restli-id header.
        if (!result.id) {
            return { success: false, error: 'LinkedIn accepted the post but returned no post URN' };
        }

        return { success: true, postUrn: result.id };
    }

    /**
     * Delete a post. Works for both member and organization authors, and is
     * idempotent — deleting an already-deleted post returns 204.
     */
    async deletePost(postUrn) {
        const result = await this.request(
            'DELETE',
            `/posts/${encodeUrn(postUrn)}`,
            {},
            {},
            { headers: { 'X-RestLi-Method': 'DELETE' } },
        );

        // Already gone is the outcome we wanted.
        if (!result.success && result.status === 404) {
            return { success: true, alreadyDeleted: true };
        }

        return result;
    }

    /**
     * Engagement for one published post.
     *
     * Normalised to exactly the shape MetaService.getPostMetrics returns so
     * the analytics table needs no per-provider branch. `shares` is null
     * rather than 0 on purpose: LinkedIn's socialMetadata carries no share
     * count, and reporting 0 would be a lie.
     *
     * Needs the *_social_feed scopes, which arrive with Community Management
     * approval — until then this 403s and the caller renders "unavailable".
     */
    async getPostMetrics(postUrn) {
        const result = await this.request('GET', `/socialMetadata/${encodeUrn(postUrn)}`);
        if (!result.success) return result;

        const d = result.data || {};
        const likes = Object.values(d.reactionSummaries || {})
            .reduce((total, r) => total + (r?.count || 0), 0);

        return {
            success: true,
            metrics: {
                likes,
                comments: d.commentSummary?.count ?? null,
                shares: null,
                permalink: `https://www.linkedin.com/feed/update/${postUrn}`,
                thumbnail: null,
                publishedAt: null,
            },
        };
    }

    // ==================== OAUTH ====================

    /**
     * Permissions requested at OAuth time.
     *
     * The first four are self-serve (Sign In with LinkedIn using OIDC, plus
     * Share on LinkedIn). The organization scopes require Community
     * Management API approval and stay off until LINKEDIN_ORG_SCOPES_ENABLED
     * is set.
     *
     * WARNING: changing this set INVALIDATES EVERY TOKEN LinkedIn has already
     * issued for this app. Turning the org scopes on is a forced-reconnect
     * release for all connected users — ship it with a notice, never quietly.
     */
    static get MEMBER_SCOPES() {
        // Self-serve: "Sign In with LinkedIn using OpenID Connect" + "Share on
        // LinkedIn". No review needed.
        return ['openid', 'profile', 'email', 'w_member_social'];
    }

    static get ORG_SCOPES() {
        // Community Management API only. Requesting these without approval
        // makes LinkedIn reject the whole authorization with
        // unauthorized_scope_error -- which would break member sign-in too.
        return ['r_organization_social', 'w_organization_social', 'rw_organization_admin'];
    }

    /** Whether the app is approved to ask for the organization scopes at all. */
    static get ORG_CONNECT_AVAILABLE() {
        return process.env.LINKEDIN_ORG_SCOPES_ENABLED === 'true';
    }

    /**
     * Scopes for a connect attempt.
     *
     * 'organization' is a superset -- one LinkedIn token covers posting as the
     * member AND as any Page they administer. There is no way to hold two
     * separate LinkedIn connections, so choosing Company Page at connect time
     * widens the existing grant rather than adding a second account.
     */
    static scopesFor(target = 'member') {
        return target === 'organization'
            ? [...LinkedInService.MEMBER_SCOPES, ...LinkedInService.ORG_SCOPES]
            : LinkedInService.MEMBER_SCOPES;
    }

    static get DEFAULT_SCOPES() {
        return LinkedInService.scopesFor(
            LinkedInService.ORG_CONNECT_AVAILABLE ? 'organization' : 'member'
        );
    }

    /** Same signature as MetaService.getOAuthUrl, but scopes are SPACE-delimited. */
    static getOAuthUrl(clientId, redirectUri, scope, state) {
        const scopes = scope || LinkedInService.DEFAULT_SCOPES;

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scopes.join(' '),
            state,
        });

        return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
    }

    /**
     * Swap the authorization code for a token.
     *
     * Form-encoded POST, unlike Meta's GET with query params. There is no
     * long-lived exchange step afterwards: the 60-day token this returns is
     * the final one, and only approved MDP partners get a refresh token.
     * The authorization code itself expires after 30 minutes.
     */
    static async exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            });

            const response = await axios.post(LINKEDIN_TOKEN_URL, body.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000,
            });

            const d = response.data || {};
            return {
                success: true,
                accessToken: d.access_token,
                expiresIn: d.expires_in,
                refreshToken: d.refresh_token || null,
                scope: d.scope ? d.scope.split(/[\s,]+/).filter(Boolean) : [],
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error_description
                    || error.response?.data?.message
                    || error.message,
            };
        }
    }
}

export default LinkedInService;
export {
    LinkedInService,
    LINKEDIN_API_VERSION,
    LINKEDIN_REST_URL,
    escapeCommentary,
    isVideoUrl,
};
