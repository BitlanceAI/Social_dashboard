import '../../config/env.js';
import axios from 'axios';
import { isVideoUrl } from '../meta/meta.service.js';

export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
export const instagramTargetId = (id) => `instagram:${id}`;

/** Direct Instagram Login tokens only; Facebook Page tokens never enter this client. */
export default class InstagramService {
    constructor(accessToken, client = axios.create({
        baseURL: `https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION || 'v22.0'}`,
        timeout: 60000,
    })) {
        this.accessToken = accessToken;
        this.client = client;
    }

    async request(method, url, data = {}, params = {}) {
        try {
            const response = await this.client.request({ method, url, params,
                headers: { Authorization: `Bearer ${this.accessToken}` },
                ...(method === 'POST' ? { data } : {}),
            });
            return { success: true, data: response.data };
        } catch (error) {
            // Do not log Axios errors: their config contains credentials.
            return { success: false, error: error.response?.data?.error?.message || 'Instagram request failed. Please retry.',
                code: error.response?.data?.error?.code, status: error.response?.status };
        }
    }

    static getOAuthUrl(clientId, redirectUri, state) {
        return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({
            client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
            scope: INSTAGRAM_SCOPES.join(','), state, enable_fb_login: '0', force_authentication: '1',
        })}`;
    }

    static async exchangeCode(code, clientId, clientSecret, redirectUri) {
        const short = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
            client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code',
            redirect_uri: redirectUri, code,
        }).toString(), { timeout: 30000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const token = short.data.access_token;
        if (!token) throw new Error('Instagram did not return an access token.');
        const long = await axios.get('https://graph.instagram.com/access_token', { timeout: 30000, params: {
            grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: token,
        } });
        if (!long.data.access_token || !(long.data.expires_in > 0)) throw new Error('Instagram token exchange failed.');
        return { accessToken: long.data.access_token, expiresIn: long.data.expires_in };
    }

    async refreshToken() {
        const result = await axios.get('https://graph.instagram.com/refresh_access_token', { timeout: 30000,
            params: { grant_type: 'ig_refresh_token', access_token: this.accessToken } });
        if (!result.data.access_token || !(result.data.expires_in > 0)) throw new Error('Instagram token renewal failed.');
        return result.data;
    }

    getProfile() {
        return this.request('GET', '/me', {}, { fields: 'user_id,username,account_type,profile_picture_url' });
    }

    async getFeed(id, username, limit = 50) {
        const result = await this.request('GET', `/${id}/media`, {}, {
            fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count', limit,
        });
        if (!result.success) return result;
        return { success: true, posts: (result.data.data || []).map((m) => ({
            id: m.id, provider: 'instagram', platform: 'instagram', pageId: instagramTargetId(id),
            pageName: `@${username}`, message: m.caption || '', mediaUrl: m.thumbnail_url || m.media_url,
            permalink: m.permalink, publishedAt: m.timestamp, likes: m.like_count ?? null,
            comments: m.comments_count ?? null, shares: null,
        })) };
    }

    async waitForContainer(id) {
        for (let attempt = 0; attempt < 40; attempt++) {
            const result = await this.request('GET', `/${id}`, {}, { fields: 'status_code,status' });
            if (!result.success) return result;
            if (result.data.status_code === 'FINISHED') return { success: true };
            if (['ERROR', 'EXPIRED'].includes(result.data.status_code)) {
                return { success: false, error: result.data.status || 'Instagram could not process this media.' };
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return { success: false, error: 'Instagram media processing timed out.' };
    }

    async publishPost(id, { caption = '', mediaUrls = [] }) {
        if (!Array.isArray(mediaUrls) || mediaUrls.length < 1 || mediaUrls.length > 10) {
            return { success: false, error: 'Choose between 1 and 10 images or videos for Instagram.' };
        }
        const carousel = mediaUrls.length > 1;
        const children = [];
        for (const url of mediaUrls) {
            const result = await this.request('POST', `/${id}/media`, {
                ...(isVideoUrl(url) ? { video_url: url, media_type: carousel ? 'VIDEO' : 'REELS' } : { image_url: url }),
                ...(carousel ? { is_carousel_item: true } : { caption }),
            });
            if (!result.success) return result;
            if (!result.data.id) return { success: false, error: 'Instagram returned no media container.' };
            const ready = await this.waitForContainer(result.data.id);
            if (!ready.success) return ready;
            children.push(result.data.id);
        }
        let creationId = children[0];
        if (carousel) {
            const parent = await this.request('POST', `/${id}/media`, {
                media_type: 'CAROUSEL', children: children.join(','), caption,
            });
            if (!parent.success) return parent;
            creationId = parent.data.id;
            if (!creationId) return { success: false, error: 'Instagram returned no carousel container.' };
            const ready = await this.waitForContainer(creationId);
            if (!ready.success) return ready;
        }
        return this.request('POST', `/${id}/media_publish`, { creation_id: creationId });
    }
}
