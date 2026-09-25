import '../../config/env.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { uploadPostMedia } from '../../shared/storage/postMedia.js';
import { cleanPhones, isWhatsAppEnabled } from '../whatsapp/whatsapp.service.js';
import { requestApproval } from '../approvals/approval.service.js';
import { billingOwner, ensureSubscription } from '../billing/billing.service.js';
import { subscriptionAccess } from '../billing/billing.policy.js';

const db = () => {
    if (!supabaseAdmin) throw new Error('Supabase service credentials are required');
    return supabaseAdmin;
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const handlePattern = /^[a-z0-9._]{1,30}$/;
export const normalizeHandle = value => {
    const handle = String(value || '').trim().toLowerCase().replace(/^@/, '');
    if (!handlePattern.test(handle)) throw fail('Enter a valid Instagram handle');
    return handle;
};

const one = async query => {
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
};
const rows = async query => {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

export async function destination(workspaceId, pageId, platforms) {
    if (!pageId || !Array.isArray(platforms) || !platforms.length
        || platforms.some(p => !['facebook', 'instagram'].includes(p))) {
        throw fail('Choose a connected Facebook or Instagram destination');
    }
    const connection = await one(db().from('meta_connections').select('id, user_id, pages, is_active')
        .eq('workspace_id', workspaceId).eq('is_active', true));
    const page = (connection?.pages || []).find(p => String(p.id) === String(pageId));
    if (!page) throw fail('Destination Page is no longer connected', 409);
    if (platforms.includes('instagram') && !page.instagram_business_account?.id) {
        throw fail('Destination Page has no linked Instagram Business account', 409);
    }
    return { connection, page };
}

export async function saveWatch(workspaceId, userId, input, id = null) {
    const source_handle = normalizeHandle(input.sourceHandle);
    if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 20) {
        throw fail('Choose 1 to 20 connected destination accounts');
    }
    const targets = [];
    const seen = new Set();
    for (const target of input.targets) {
        const pageId = String(target.pageId || '');
        if (seen.has(pageId)) throw fail('Each destination Page can be selected only once');
        const platforms = target.platforms;
        const { page } = await destination(workspaceId, pageId, platforms);
        if (platforms.includes('instagram')
            && String(page.instagram_business_account?.username || '').toLowerCase() === source_handle) {
            throw fail('Source and destination Instagram accounts must differ');
        }
        seen.add(pageId);
        targets.push({ pageId, platforms });
    }
    const mode = input.mode || 'review';
    if (!['review', 'automatic', 'approval'].includes(mode)) throw fail('Invalid repost mode');
    const approver_phones = cleanPhones(input.approverPhones || []);
    if (mode === 'approval' && (!approver_phones.length || !isWhatsAppEnabled())) {
        throw fail('Approval mode requires WhatsApp to be configured and at least one approver number');
    }
    const checks_per_day = Number(input.checksPerDay ?? 1);
    const scrape_limit = Number(input.scrapeLimit ?? 24);
    const gap_minutes = Number(input.gapMinutes ?? 60);
    if (!Number.isInteger(checks_per_day) || checks_per_day < 1 || checks_per_day > 12
        || !Number.isInteger(scrape_limit) || scrape_limit < 1 || scrape_limit > 100
        || !Number.isInteger(gap_minutes) || gap_minutes < 0 || gap_minutes > 1440) {
        throw fail('Check frequency, post limit, or spacing is out of range');
    }
    const patch = { source_handle, targets, mode, approver_phones,
        checks_per_day, scrape_limit, gap_minutes, updated_at: new Date().toISOString() };
    if (id) {
        const existing = await getWatch(workspaceId, id);
        if (existing.source_handle !== source_handle) throw fail('Create a new watch to change its source handle');
        return one(db().from('instagram_repost_watches').update(patch)
            .eq('id', id).eq('workspace_id', workspaceId).select('*'));
    }
    return one(db().from('instagram_repost_watches').insert({ ...patch, workspace_id: workspaceId, user_id: userId })
        .select('*'));
}

export async function getWatch(workspaceId, id) {
    const watch = await one(db().from('instagram_repost_watches').select('*').eq('id', id).eq('workspace_id', workspaceId));
    if (!watch) throw fail('Watch not found', 404);
    return watch;
}
export const listWatches = workspaceId => rows(db().from('instagram_repost_watches').select('*')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false }));
export async function listPosts(workspaceId, watchId) {
    const posts = await rows(db().from('instagram_repost_posts').select('*')
        .eq('workspace_id', workspaceId).eq('watch_id', watchId)
        .order('posted_at', { ascending: false, nullsFirst: false }).limit(100));
    if (!posts.length) return [];
    const deliveries = await rows(db().from('scheduled_posts')
        .select('id,repost_source_post_id,page_id,page_name,status,error_message,scheduled_time,published_at')
        .eq('workspace_id', workspaceId).in('repost_source_post_id', posts.map(p => p.id)));
    return posts.map(post => ({ ...post, deliveries: deliveries.filter(d => d.repost_source_post_id === post.id) }));
}

async function runApify(input) {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw fail('APIFY_TOKEN is not configured on the Dashboard server', 503);
    const actor = (process.env.APIFY_IG_ACTOR || 'apify/instagram-post-scraper').trim().replace('/', '~');
    const res = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=300`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(330000),
    });
    if (!res.ok) throw new Error(`Apify scrape failed (${res.status})`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('Apify returned an invalid post list');
    const mapped = items.map(mapApifyPost);
    if (mapped.some(post => !post)) throw new Error('Apify returned a post without usable media or an error item');
    return mapped;
}

export async function scrapeProfile(handle, limit, newerThan) {
    const input = { username: [handle], resultsLimit: limit, skipPinnedPosts: true };
    if (newerThan) input.onlyPostsNewerThan = new Date(newerThan).toISOString();
    return runApify(input);
}

export async function scrapePostUrl(shortcode) {
    if (!/^[A-Za-z0-9_-]+$/.test(shortcode)) throw fail('Invalid Instagram post ID');
    const posts = await runApify({ username: [`https://www.instagram.com/p/${shortcode}/`], resultsLimit: 1 });
    if (!posts.length || posts[0].shortcode !== shortcode) throw fail('Source post was not returned by Apify', 502);
    return posts[0];
}

export function mapApifyPost(item) {
    if (!item?.shortCode || item.error) return null;
    if (item.type === 'Video' && !item.videoUrl) return null;
    const children = item.type === 'Sidecar' && Array.isArray(item.childPosts) ? item.childPosts : null;
    const media = children?.length ? children.map(c => c.videoUrl || c.displayUrl)
        : item.videoUrl ? [item.videoUrl]
            : Array.isArray(item.images) && item.images.length ? item.images : [item.displayUrl];
    const urls = media.filter(u => typeof u === 'string' && u.startsWith('https://'));
    if (!urls.length) return null;
    return { shortcode: item.shortCode, permalink: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
        caption: item.caption || '', media_type: children?.length ? 'carousel' : item.videoUrl || item.type === 'Video' ? 'video' : 'image',
        original_media_urls: urls, posted_at: item.timestamp || null };
}

async function mirrorMedia(watch, post, renewLease = false) {
    const files = [];
    for (let i = 0; i < post.original_media_urls.length; i++) {
        if (renewLease) {
            const { error: leaseError } = await db().from('instagram_repost_watches')
                .update({ run_claimed_until: new Date(Date.now() + 7 * 60000).toISOString() })
                .eq('id', watch.id);
            if (leaseError) throw leaseError;
        }
        const source = post.original_media_urls[i];
        const url = new URL(source);
        if (url.protocol !== 'https:' || !/(^|\.)(fbcdn\.net|cdninstagram\.com|instagram\.com)$/.test(url.hostname)) {
            throw new Error('Source media URL is not an Instagram CDN URL');
        }
        const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'error' });
        if (!response.ok) throw new Error(`Media download failed (${response.status})`);
        const mime = (response.headers.get('content-type') || '').split(';')[0];
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
            'video/mp4': 'mp4', 'video/quicktime': 'mov' }[mime];
        if (!extension) throw new Error(`Unsupported media type: ${mime}`);
        const advertisedSize = Number(response.headers.get('content-length') || 0);
        if (advertisedSize > 100 * 1024 * 1024) throw new Error('Source media exceeds 100 MB');
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 100 * 1024 * 1024) throw new Error('Source media exceeds 100 MB');
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        files.push({ originalname: `${post.shortcode}-${i}.${extension}`, mimetype: mime, buffer });
    }
    const uploaded = await uploadPostMedia(watch.user_id, files, watch.workspace_id);
    if (!uploaded.success || uploaded.urls?.length !== files.length) throw new Error(uploaded.error || 'Media upload incomplete');
    return uploaded.urls;
}

export function mediaSupported(post, platforms) {
    const urls = post.media_urls || [];
    if (!urls.length) return false;
    if (platforms.includes('facebook') && urls.length > 1 && urls.some(u => /\.(mp4|mov)(?:\?|$)/i.test(u))) return false;
    if (platforms.includes('instagram') && urls.length > 10) return false;
    return true;
}

async function sendRepostApproval(delivery) {
    const attemptedAt = new Date().toISOString();
    const result = await requestApproval(delivery).catch(error => ({ sent: false, error: error.message }));
    const { error } = await db().from('scheduled_posts').update({
        repost_approval_attempted_at: attemptedAt,
        error_message: result.sent ? null : `WhatsApp approval could not be sent: ${result.error || 'unknown error'}`,
    }).eq('id', delivery.id);
    if (error) throw error;
    return result;
}

export async function queuePost(workspaceId, postId, { forceApproval = false, scheduledTime = null } = {}) {
    const post = await one(db().from('instagram_repost_posts').select('*').eq('id', postId).eq('workspace_id', workspaceId));
    if (!post) throw fail('Imported post not found', 404);
    if (post.state === 'skipped') throw fail('Skipped posts cannot be queued', 409);
    if (post.state === 'media_failed' || !post.media_urls?.length) throw fail('Media is not ready; retry the import first', 409);
    const watch = await getWatch(workspaceId, post.watch_id);
    if (!watch.targets?.length) throw fail('Watch has no destination accounts', 409);
    const approval = forceApproval || watch.mode === 'approval';
    if (approval && (!watch.approver_phones?.length || !isWhatsAppEnabled())) throw fail('WhatsApp approval is unavailable', 409);
    const resolvedTargets = [];
    for (const target of watch.targets || []) {
        const resolved = await destination(workspaceId, target.pageId, target.platforms);
        if (target.platforms.includes('instagram')
            && String(resolved.page.instagram_business_account?.username || '').toLowerCase() === watch.source_handle) {
            throw fail('Source and destination Instagram accounts must differ', 409);
        }
        if (!mediaSupported(post, target.platforms)) throw fail(`Media is unsupported by ${resolved.page.name}`, 409);
        resolvedTargets.push({ ...target, ...resolved });
    }
    const deliveries = [];
    let created = 0;
    for (const target of resolvedTargets) {
        const { connection, page } = target;
        const existing = await one(db().from('scheduled_posts').select('id,status,page_name')
            .eq('repost_source_post_id', post.id).eq('page_id', target.pageId));
        if (existing) { deliveries.push(existing); continue; }
        const row = { workspace_id: workspaceId, user_id: watch.user_id, provider: 'meta',
            meta_connection_id: connection.id, page_id: target.pageId, page_name: page.name,
            platforms: target.platforms, content: post.caption, media_urls: post.media_urls,
            scheduled_time: scheduledTime || new Date().toISOString(), timezone: 'UTC',
            status: approval ? 'pending_approval' : 'pending',
            approver_phones: approval ? watch.approver_phones : [], repost_source_post_id: post.id };
        const { data: delivery, error } = await db().from('scheduled_posts').insert(row).select('*').single();
        if (error?.code === '23505') {
            deliveries.push(await one(db().from('scheduled_posts').select('id,status,page_name')
                .eq('repost_source_post_id', post.id).eq('page_id', target.pageId)));
            continue;
        }
        if (error) throw error;
        deliveries.push(delivery);
        created++;
    }
    if (approval) {
        const pending = await rows(db().from('scheduled_posts').select('*')
            .eq('repost_source_post_id', post.id).eq('status', 'pending_approval')
            .order('created_at', { ascending: true }).order('id', { ascending: true }));
        if (pending.length && !pending[0].approval_sent_at && !pending[0].repost_approval_attempted_at) {
            await sendRepostApproval(pending[0]);
        }
    }
    if (deliveries.length) await db().from('instagram_repost_posts').update({ state: 'queued',
        error_message: null, updated_at: new Date().toISOString() }).eq('id', post.id);
    return { skipped: created === 0, deliveries };
}

/** Keep one source post under review. Called after a scrape or a settled decision. */
export async function pumpRepostApprovalQueue(watch) {
    if (!watch?.active || watch.mode !== 'approval') return { skipped: true };
    const ownerId = await billingOwner(watch.user_id, watch.workspace_id);
    if (!subscriptionAccess(await ensureSubscription(ownerId)).active) return { skipped: true, reason: 'Subscription inactive' };
    const { data: claimed, error: claimError } = await db().rpc('claim_instagram_repost_approval_watch', { p_watch_id: watch.id });
    if (claimError) throw claimError;
    if (!claimed) return { skipped: true };
    const heartbeat = setInterval(async () => {
        try {
            const { error } = await db().from('instagram_repost_watches')
                .update({ approval_claimed_until: new Date(Date.now() + 15 * 60000).toISOString() })
                .eq('id', watch.id);
            if (error) throw error;
        } catch (error) {
            console.error(`[Reposts] Approval claim heartbeat failed for ${watch.id}:`, error.message);
        }
    }, 60000);
    heartbeat.unref?.();
    try {
        const pending = await rows(db().rpc('pending_instagram_repost_approvals', { p_watch_id: watch.id }));
        if (pending.length) {
            const delivery = pending[0];
            const lastAttempt = delivery.repost_approval_attempted_at && new Date(delivery.repost_approval_attempted_at).getTime();
            if (!delivery.approval_sent_at && (!lastAttempt || Date.now() - lastAttempt >= 5 * 60000)) {
                await sendRepostApproval(delivery);
            }
            return { awaiting: pending.length };
        }
        const { data: postId, error: nextError } = await db().rpc('next_instagram_repost_approval_candidate', { p_watch_id: watch.id });
        if (nextError) throw nextError;
        if (!postId) return { empty: true };
        const { data: lastScheduled, error: lastError } = await db().rpc('last_instagram_repost_delivery_time', { p_watch_id: watch.id });
        if (lastError) throw lastError;
        const anchor = lastScheduled ? new Date(lastScheduled).getTime() : 0;
        const when = new Date(Math.max(Date.now(), anchor + watch.gap_minutes * 60000)).toISOString();
        return await queuePost(watch.workspace_id, postId, { scheduledTime: when });
    } finally {
        clearInterval(heartbeat);
        const { error } = await db().from('instagram_repost_watches')
            .update({ approval_claimed_until: null }).eq('id', watch.id);
        if (error) console.error(`[Reposts] Could not release approval claim for ${watch.id}:`, error.message);
    }
}

export async function advanceRepostApprovalForDelivery(delivery) {
    if (!delivery?.repost_source_post_id) return;
    const source = await one(db().from('instagram_repost_posts').select('watch_id')
        .eq('id', delivery.repost_source_post_id).eq('workspace_id', delivery.workspace_id));
    if (!source) return;
    const watch = await getWatch(delivery.workspace_id, source.watch_id);
    await pumpRepostApprovalQueue(watch);
}

export async function runWatch(watch, { force = false } = {}) {
    const ownerId = await billingOwner(watch.user_id, watch.workspace_id);
    if (!subscriptionAccess(await ensureSubscription(ownerId)).active) {
        throw fail('An active subscription is required to scrape Instagram posts', 402);
    }
    const { data: claimed, error: claimError } = await db().rpc('claim_instagram_repost_watch', { p_watch_id: watch.id, p_force: force });
    if (claimError) throw claimError;
    if (!claimed) return { skipped: true, reason: 'Watch is paused, not due, or already running' };
    const baseline = !watch.last_run_at;
    let imported = 0;
    let failed = 0;
    try {
        const found = await scrapeProfile(watch.source_handle, watch.scrape_limit,
            baseline ? null : watch.last_seen_posted_at || watch.created_at);
        const ordered = [...found].sort((a, b) => new Date(a.posted_at || 0) - new Date(b.posted_at || 0));
        let newest = watch.last_seen_posted_at ? new Date(watch.last_seen_posted_at).getTime() : 0;
        let newestCode = watch.last_seen_shortcode;
        for (const source of ordered) {
            let post = await one(db().from('instagram_repost_posts').select('*')
                .eq('watch_id', watch.id).eq('shortcode', source.shortcode));
            if (post && post.state !== 'media_failed') continue;
            const payload = { workspace_id: watch.workspace_id, watch_id: watch.id, ...source };
            try {
                payload.media_urls = await mirrorMedia(watch, source, true);
                payload.state = 'imported';
                payload.error_message = null;
            } catch (err) {
                payload.media_urls = [];
                payload.state = 'media_failed';
                payload.error_message = err.message;
                failed++;
            }
            const { data, error } = await db().from('instagram_repost_posts')
                .upsert(payload, { onConflict: 'watch_id,shortcode' }).select('*').single();
            if (error) throw error;
            post = data;
            if (post.state !== 'imported') continue;
            imported++;
            if (!baseline && watch.mode === 'automatic') {
                try {
                    const when = new Date(Date.now() + (imported - 1) * watch.gap_minutes * 60000).toISOString();
                    await queuePost(watch.workspace_id, post.id, { scheduledTime: when });
                } catch (err) {
                    await db().from('instagram_repost_posts').update({ error_message: err.message }).eq('id', post.id);
                    failed++;
                }
            }
        }
        // Retain the old cursor after any media failure, so the source can be fetched again.
        if (!failed && found.length) {
            const latest = found.reduce((a, b) => new Date(a.posted_at || 0) > new Date(b.posted_at || 0) ? a : b);
            const timestamp = new Date(latest.posted_at || 0).getTime();
            if (timestamp > newest) { newest = timestamp; newestCode = latest.shortcode; }
        }
        const update = { ...(baseline && failed ? {} : { last_run_at: new Date().toISOString() }),
            last_run_status: failed ? 'partial' : 'ok',
            last_run_error: failed ? `${failed} post(s) could not be imported or queued` : null,
            last_run_new_posts: imported, run_claimed_until: null,
            ...(newest && !failed ? { last_seen_posted_at: new Date(newest).toISOString(), last_seen_shortcode: newestCode } : {}) };
        await db().from('instagram_repost_watches').update(update).eq('id', watch.id);
        if (watch.mode === 'approval') await pumpRepostApprovalQueue(watch);
        return { baseline, scraped: found.length, imported, failed };
    } catch (err) {
        await db().from('instagram_repost_watches').update({
            last_run_status: 'error', last_run_error: err.message, run_claimed_until: null }).eq('id', watch.id);
        throw err;
    }
}

export async function runDueWatches() {
    if (!process.env.APIFY_TOKEN || !supabaseAdmin) return;
    for (let offset = 0; ; offset += 50) {
        const watches = await rows(db().from('instagram_repost_watches').select('*').eq('active', true)
            .order('id').range(offset, offset + 49));
        for (const watch of watches) {
            try { await runWatch(watch); }
            catch (err) { console.error(`[Reposts] @${watch.source_handle}:`, err.message); }
            if (watch.mode === 'approval') {
                try { await pumpRepostApprovalQueue(watch); }
                catch (err) { console.error(`[Reposts] Approval queue @${watch.source_handle}:`, err.message); }
            }
        }
        if (watches.length < 50) break;
    }
}

export async function retryMedia(workspaceId, postId) {
    const post = await one(db().from('instagram_repost_posts').select('*')
        .eq('id', postId).eq('workspace_id', workspaceId));
    if (!post) throw fail('Imported post not found', 404);
    if (post.state !== 'media_failed') throw fail('This post does not need a media retry', 409);
    const watch = await getWatch(workspaceId, post.watch_id);
    const source = await scrapePostUrl(post.shortcode);
    const media_urls = await mirrorMedia(watch, source);
    return one(db().from('instagram_repost_posts').update({ media_urls, original_media_urls: source.original_media_urls,
        state: 'imported', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', post.id).eq('workspace_id', workspaceId).select('*'));
}
