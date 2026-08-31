/**
 * Post Scheduler
 *
 * Every minute, publishes any scheduled_posts row whose time has come — to
 * the Facebook Page and/or linked Instagram Business account it targets, or
 * to LinkedIn.
 *
 * The row's `provider` column picks the publisher. Everything around that
 * choice — claiming the row, recording the outcome, notifying the user — is
 * provider-neutral and shared.
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import { createClient } from '@supabase/supabase-js';
import MetaService from '../meta/meta.service.js';
import LinkedInService from '../linkedin/linkedin.service.js';
import { decryptData } from '../../shared/utils/encryption.js';
import { sendToWorkspace } from '../push/push.service.js';

let supabase;

const CHECK_INTERVAL = 60 * 1000; // 1 minute

// LinkedIn tokens last 60 days and a non-partner app cannot refresh them, so
// the only remedy is to ask the member to reconnect before they lapse. Swept
// roughly once a day rather than every tick.
const EXPIRY_SWEEP_EVERY_TICKS = 24 * 60;
const EXPIRY_WARN_DAYS = 7;
const EXPIRY_RENOTIFY_DAYS = 14;
let tickCount = 0;

// The server and the database migrate separately, so there is always a window
// where this code is ahead of the schema. Asking PostgREST to embed a table
// that does not exist yet fails the WHOLE query -- which would take Meta
// publishing down with it. So the LinkedIn embed is probed, not assumed.
//
// null = not known yet, true/false = last observed. Re-probed periodically so
// applying the migration takes effect without restarting the process.
let linkedinSchemaReady = null;
const SCHEMA_REPROBE_EVERY_TICKS = 5;

/** PostgREST codes for "no such table" and "no such relationship". */
// PGRST200/205 are PostgREST's "no such relationship"/"no such table";
// 42703 and 42P01 are Postgres's "undefined column"/"undefined table", which
// surface when a column is named explicitly rather than embedded. All four mean
// the same thing here: this code is ahead of the schema, which is normal in the
// window between a server deploy and its migration.
const MISSING_SCHEMA_CODES = new Set(['PGRST200', 'PGRST205', '42703', '42P01']);
const isMissingSchema = (error) => MISSING_SCHEMA_CODES.has(error?.code);

const META_EMBED = `
                *,
                meta_connections (
                    access_token,
                    user_id
                )
            `;

const FULL_EMBED = `
                *,
                meta_connections (
                    access_token,
                    user_id
                ),
                linkedin_connections (
                    id,
                    access_token,
                    user_id,
                    token_expires_at,
                    author_urn,
                    is_active
                )
            `;

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
        // Clear the "missing schema" flag first, so the upcoming pass actually
        // retries the LinkedIn embed. Applying the migration then takes effect
        // within minutes, with no restart.
        if (linkedinSchemaReady === false && tickCount % SCHEMA_REPROBE_EVERY_TICKS === 0) {
            linkedinSchemaReady = null;
        }

        await checkAndPublishPosts();

        // Piggybacks on the same reachability guard as the publish pass.
        if (tickCount++ % EXPIRY_SWEEP_EVERY_TICKS === 0) {
            sweepExpiringLinkedInTokens();
        }
    };

    runScheduler();
    setInterval(runScheduler, CHECK_INTERVAL);
};

const checkAndPublishPosts = async () => {
    try {
        const now = new Date().toISOString();

        const fetchDue = (embed) => supabase
            .from('scheduled_posts')
            .select(embed)
            .eq('status', 'pending')
            .lte('scheduled_time', now);

        // Only try the LinkedIn embed when the schema is known-good or untested;
        // once it has failed we stay on the Meta-only query until a re-probe.
        const triedFullEmbed = linkedinSchemaReady !== false;

        let { data: posts, error } = await fetchDue(triedFullEmbed ? FULL_EMBED : META_EMBED);

        if (triedFullEmbed && error && isMissingSchema(error)) {
            // Migration not applied yet. Fall back to Meta-only so Facebook and
            // Instagram keep publishing, and say so once rather than every minute.
            if (linkedinSchemaReady !== false) {
                console.warn(
                    '[Scheduler] linkedin_connections is not in the database yet '
                    + '-- run the LinkedIn migration. Publishing Meta posts only until then.'
                );
            }
            linkedinSchemaReady = false;
            ({ data: posts, error } = await fetchDue(META_EMBED));
        } else if (triedFullEmbed && !error) {
            // Only the FULL embed succeeding proves the schema is there --
            // a successful fallback says nothing about it.
            if (linkedinSchemaReady === false) {
                console.log('[Scheduler] linkedin_connections is available -- LinkedIn publishing enabled.');
            }
            linkedinSchemaReady = true;
        }

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

/**
 * Publish a Meta row. Lifted verbatim out of publishScheduledPost — the only
 * changes are the dedent and taking `platforms` as an argument.
 *
 * @returns {{results: object, publishedIds: string[], failures: string[]}}
 */
const publishViaMeta = async (post, platforms) => {
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

    return { results, publishedIds, failures };
};

/**
 * Publish a LinkedIn row.
 *
 * Mirrors publishViaMeta, with one addition that carries the whole 60-day
 * token story: the expiry is checked up front so the user sees a sentence
 * they can act on instead of a raw 401 buried in error_message.
 *
 * @returns {{results: object, publishedIds: string[], failures: string[]}}
 */
const publishViaLinkedIn = async (post) => {
    const connection = post.linkedin_connections;

    if (!connection) {
        throw new Error('LinkedIn connection not found or deleted');
    }

    if (!connection.is_active) {
        throw new Error('Your LinkedIn account is disconnected. Reconnect it and reschedule this post.');
    }

    if (connection.token_expires_at && new Date(connection.token_expires_at) <= new Date()) {
        const on = new Date(connection.token_expires_at).toDateString();
        throw new Error(
            `Your LinkedIn connection expired on ${on}. Reconnect in the dashboard and reschedule this post.`
        );
    }

    let accessToken;
    try {
        accessToken = decryptData(connection.access_token);
        if (!accessToken) throw new Error('Decrypted token is null');
    } catch (e) {
        throw new Error('Failed to decrypt access token');
    }

    const linkedinService = new LinkedInService(accessToken);

    // page_id holds the author URN — urn:li:person:… or urn:li:organization:…
    const authorUrn = post.page_id || connection.author_urn;

    const results = {};
    const publishedIds = [];
    const failures = [];

    const result = await linkedinService.publishPost(authorUrn, {
        commentary: post.content,
        mediaUrls: post.media_urls,
        linkUrl: post.link_url,
    });

    if (result.success) {
        results.linkedin = { success: true, postId: result.postUrn };
        publishedIds.push(result.postUrn);
    } else {
        results.linkedin = { success: false, error: result.error };
        failures.push(`linkedin: ${result.error}`);

        // A revoked token will fail every future post too — reflect that in
        // the dashboard rather than letting them all fail one by one.
        if (result.status === 401) {
            await supabase
                .from('linkedin_connections')
                .update({ is_active: false })
                .eq('id', connection.id);
        }
    }

    return { results, publishedIds, failures };
};

/**
 * Nudge anyone whose LinkedIn connection is about to lapse.
 *
 * expiry_notified_at dedupes, so a member gets one push per approaching
 * expiry rather than one every time this runs.
 */
const sweepExpiringLinkedInTokens = async () => {
    try {
        const warnBefore = new Date(Date.now() + EXPIRY_WARN_DAYS * 86400000).toISOString();
        const renotifyBefore = new Date(Date.now() - EXPIRY_RENOTIFY_DAYS * 86400000).toISOString();

        const { data: connections, error } = await supabase
            .from('linkedin_connections')
            .select('id, user_id, workspace_id, display_name, token_expires_at, expiry_notified_at')
            .eq('is_active', true)
            .not('token_expires_at', 'is', null)
            .lt('token_expires_at', warnBefore);

        if (error) {
            // Before the migration lands there is no table to sweep; that is
            // expected, not an error worth logging every day.
            if (!isHtmlError(error) && !isMissingSchema(error)) {
                console.error('[Scheduler] LinkedIn expiry sweep failed:', error);
            }
            return;
        }

        for (const connection of connections || []) {
            if (connection.expiry_notified_at && connection.expiry_notified_at > renotifyBefore) {
                continue;
            }

            const days = Math.max(
                0,
                Math.floor((new Date(connection.token_expires_at).getTime() - Date.now()) / 86400000)
            );

            await sendToWorkspace(connection.workspace_id, {
                title: days === 0 ? 'LinkedIn connection expired' : 'LinkedIn connection expiring',
                body: days === 0
                    ? 'Reconnect LinkedIn to keep your scheduled posts publishing.'
                    : `Your LinkedIn connection expires in ${days} day${days === 1 ? '' : 's'}. Reconnect to keep scheduled posts publishing.`,
                url: '/socialdashboad'
            });

            await supabase
                .from('linkedin_connections')
                .update({ expiry_notified_at: new Date().toISOString() })
                .eq('id', connection.id);
        }
    } catch (error) {
        console.error('[Scheduler] LinkedIn expiry sweep error:', error);
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
        // `provider` is defaulted in the schema, but a row written between
        // deploy and migration could still be null.
        const provider = post.provider || 'meta';

        const { results, publishedIds, failures } = provider === 'linkedin'
            ? await publishViaLinkedIn(post)
            : await publishViaMeta(post, platforms);

        if (publishedIds.length === 0) {
            throw new Error(failures.join('; ') || 'Unknown API error');
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
            await sendToWorkspace(post.workspace_id, {
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
        await sendToWorkspace(post.workspace_id, {
            title: 'Scheduled post failed',
            body: `${post.page_name}: ${error.message}`,
            url: '/socialdashboad'
        });
    }
};
