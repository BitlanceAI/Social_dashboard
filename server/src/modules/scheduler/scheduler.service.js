/**
 * Post Scheduler
 *
 * Every minute, publishes any scheduled_posts row whose time has come to the
 * Facebook Page and/or linked Instagram Business account it targets.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import { createClient } from '@supabase/supabase-js';
import MetaService from '../meta/meta.service.js';
import { decryptData } from '../../shared/utils/encryption.js';
import { sendToUser } from '../push/push.service.js';

let supabase;

const CHECK_INTERVAL = 60 * 1000; // 1 minute

// Quick connectivity check — returns false if Supabase is paused/unreachable
const isSupabaseReachable = async () => {
    try {
        const url = `${process.env.SUPABASE_URL}/rest/v1/`;
        const res = await fetch(url, {
            headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
            signal: AbortSignal.timeout(5000),
        });
        const text = await res.text();
        // Paused projects return an HTML page instead of JSON
        if (text.trim().startsWith('<')) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
};

// Supabase occasionally returns an HTML error page (e.g. Cloudflare 525) when
// the project is paused. Detect it so the logs do not fill with raw HTML.
const isHtmlError = (error) => {
    return error && typeof error.message === 'string'
        && (error.message.trim().startsWith('<') || error.message.includes('<!DOCTYPE html>'));
};

export const startPostScheduler = () => {
    if (!supabase) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('[Scheduler] Missing Supabase credentials — scheduler disabled.');
            return;
        }

        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        });
    }

    console.log('[Scheduler] Starting post scheduler (1-minute interval)...');

    const runScheduler = async () => {
        const reachable = await isSupabaseReachable();
        if (!reachable) {
            console.warn('[Scheduler] Supabase unreachable (project may be paused). Skipping tick.');
            return;
        }
        checkAndPublishPosts();
    };

    runScheduler();
    setInterval(runScheduler, CHECK_INTERVAL);
};

const checkAndPublishPosts = async () => {
    try {
        const now = new Date().toISOString();

        const { data: posts, error } = await supabase
            .from('scheduled_posts')
            .select(`
                *,
                meta_connections (
                    access_token,
                    user_id
                )
            `)
            .eq('status', 'pending')
            .lte('scheduled_time', now);

        if (error) {
            if (isHtmlError(error)) {
                console.warn('[Scheduler] Supabase connection issue (HTML error received). Skipping scheduled posts fetch.');
            } else {
                console.error('[Scheduler] Error fetching scheduled posts:', error);
            }
            return;
        }

        if (!posts || posts.length === 0) return;

        console.log(`[Scheduler] Found ${posts.length} social post(s) to publish.`);

        for (const post of posts) {
            await publishScheduledPost(post);
        }

    } catch (error) {
        console.error('[Scheduler] checkAndPublishPosts critical error:', error);
    }
};

const publishScheduledPost = async (post) => {
    const platforms = (post.platforms && post.platforms.length) ? post.platforms : ['facebook'];
    console.log(`[Scheduler] Publishing post ${post.id} to ${platforms.join(', ')} on page ${post.page_name}...`);

    // Claim the row so a slow publish is not picked up twice by the next tick
    const { data: claimed, error: claimError } = await supabase
        .from('scheduled_posts')
        .update({ status: 'processing' })
        .eq('id', post.id)
        .eq('status', 'pending')
        .select('id');

    if (claimError || !claimed || claimed.length === 0) {
        return; // another tick already took it
    }

    try {
        if (!post.meta_connections) {
            throw new Error('Meta connection not found or deleted');
        }

        let accessToken;
        try {
            accessToken = decryptData(post.meta_connections.access_token);
            if (!accessToken) throw new Error('Decrypted token is null');
        } catch (e) {
            throw new Error('Failed to decrypt access token');
        }

        const metaService = new MetaService(accessToken);

        // Publishing as a Page requires the Page access token, not the user token
        const tokenResult = await metaService.getPageToken(post.page_id);
        if (!tokenResult.success) {
            throw new Error(tokenResult.error);
        }
        const { pageAccessToken } = tokenResult;

        const results = {};
        const publishedIds = [];
        const failures = [];

        if (platforms.includes('facebook')) {
            const fb = await metaService.publishPost(post.page_id, pageAccessToken, {
                message: post.content,
                link: post.link_url,
                mediaUrls: post.media_urls
            });

            if (fb.success) {
                const id = fb.data.id || fb.data.post_id;
                results.facebook = { success: true, postId: id };
                publishedIds.push(id);
            } else {
                results.facebook = { success: false, error: fb.error };
                failures.push(`facebook: ${fb.error}`);
            }
        }

        if (platforms.includes('instagram')) {
            const igAccount = await metaService.getInstagramAccount(post.page_id, pageAccessToken);

            if (!igAccount.success) {
                results.instagram = { success: false, error: igAccount.error };
                failures.push(`instagram: ${igAccount.error}`);
            } else {
                const ig = await metaService.publishInstagramPost(
                    igAccount.instagramAccount.id,
                    pageAccessToken,
                    { caption: post.content, mediaUrls: post.media_urls }
                );

                if (ig.success) {
                    results.instagram = { success: true, postId: ig.data.id };
                    publishedIds.push(ig.data.id);
                } else {
                    results.instagram = { success: false, error: ig.error };
                    failures.push(`instagram: ${ig.error}`);
                }
            }
        }

        if (publishedIds.length === 0) {
            throw new Error(failures.join('; ') || 'Unknown Meta API error');
        }

        // Partial success still counts as published, with the failures recorded
        console.log(`[Scheduler] Post ${post.id} published. Ids: ${publishedIds.join(', ')}`);

        await supabase
            .from('scheduled_posts')
            .update({
                status: 'published',
                published_at: new Date().toISOString(),
                meta_post_id: publishedIds[0],
                publish_results: results,
                error_message: failures.length ? failures.join('; ') : null
            })
            .eq('id', post.id);

        // Only interrupt someone for a partial failure; a clean publish is
        // what they already expected.
        if (failures.length) {
            await sendToUser(post.user_id, {
                title: 'Post published, with a problem',
                body: `${post.page_name}: ${failures.join('; ')}`,
                url: '/socialdashboad'
            });
        }

    } catch (error) {
        console.error(`[Scheduler] Failed to publish post ${post.id}:`, error.message);

        await supabase
            .from('scheduled_posts')
            .update({
                status: 'failed',
                error_message: error.message
            })
            .eq('id', post.id);

        // A post that never went out is otherwise invisible until someone
        // opens the dashboard.
        await sendToUser(post.user_id, {
            title: 'Scheduled post failed',
            body: `${post.page_name}: ${error.message}`,
            url: '/socialdashboad'
        });
    }
};
