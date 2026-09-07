/**
 * Design generation — turn a graphic template + user values into an image job.
 *
 * Ported shape of designController.generate-from-template, adapted to this
 * stack: template lives in Supabase (graphic_templates), the job in
 * design_jobs. Rendering order of preference:
 *   1. DESIGN_GENERATE_URL — external service override (the legacy Python
 *      /api/generate_from_prompt), kept for explicit opt-in.
 *   2. OpenAI (generation.service.js) when OPENAI_API_KEY is set.
 * When neither is configured, the job is created and left pending with the
 * filled prompt returned — a clear integration point, nothing fabricated.
 *
 * NOTE: the Mongo pipeline also deducts credits via a ledger and pulls
 * logo/brand colour from a BusinessProfile. Neither exists in this stack yet;
 * both are marked as integration points below rather than faked.
 */

import '../../config/env.js';

import { supabaseAdmin } from '../../config/supabase.js';
import { getTemplateByKey } from '../templates/templates.service.js';
import { fillPromptTemplate, valuesFromFields } from '../../shared/utils/promptTemplate.js';
import { isBunnyConfigured, isBunnyUrl, bunnyUpload, bunnyRemove } from '../../shared/storage/bunny.js';
import { isOpenAIConfigured, generateImage } from './generation.service.js';

const GENERATE_URL = process.env.DESIGN_GENERATE_URL || null; // external service override

// Generated flyer images are throwaway derivatives — kept only long enough to
// pull into a post, then purged so they don't accumulate in paid storage.
const DESIGN_RETENTION_DAYS = Number(process.env.DESIGN_RETENTION_DAYS) || 30;

/** Storage object key for a job's rendered image (stable — derivable from ids). */
const designObjectKey = (userId, jobId) => `designs/${userId}/${jobId}.png`;

/** Store rendered image bytes and return their public URL. */
const storeImage = async (userId, jobId, buffer, contentType = 'image/png') => {
    const key = designObjectKey(userId, jobId);
    if (isBunnyConfigured()) return bunnyUpload(key, buffer, contentType);
    const { error } = await supabaseAdmin.storage.from('post-media')
        .upload(key, buffer, { contentType, upsert: true });
    if (error) throw error;
    return supabaseAdmin.storage.from('post-media').getPublicUrl(key).data.publicUrl;
};

/** Delete a job's stored image wherever its URL says it lives (Bunny or Supabase). */
const removeImage = async (userId, jobId, url) => {
    const key = designObjectKey(userId, jobId);
    if (isBunnyUrl(url)) { await bunnyRemove(key); return; }
    const { error } = await supabaseAdmin.storage.from('post-media').remove([key]);
    if (error) throw new Error(error.message);
};

/**
 * Record a generated flyer as a media_library row so it appears in the Library
 * tab (isolated per workspace) and counts toward the user's storage usage. The
 * object_key mirrors where the image actually lives, so deletes route correctly.
 */
const registerLibraryEntry = async ({ userId, workspaceId, jobId, url, sizeBytes, title }) => {
    const safeTitle = String(title || 'design').replace(/[^a-zA-Z0-9.-]/g, '-').slice(0, 40);
    await supabaseAdmin.from('media_library').insert({
        user_id: userId,
        workspace_id: workspaceId || null,
        object_key: designObjectKey(userId, jobId),
        url,
        file_name: `${safeTitle}-${jobId.slice(0, 8)}.png`,
        mime_type: 'image/png',
        size_bytes: sizeBytes || 0,
    });
};

/**
 * Build the final prompt, create a design_job, and (if the generation service
 * is configured) render it. Returns { jobId, status, flyerUrl?, prompt }.
 */
export const generateFromTemplate = async (userId, {
    templateKey, values = {}, imageSize, quality = 'high',
    language = 'en', includeContact = true, logoUrl = null, logoMode = 'ai',
} = {}, workspaceId = null) => {
    const template = await getTemplateByKey(templateKey);

    // Fill {{tokens}} from defaults overlaid with user values, honouring the
    // contact opt-out (blanks contact fields + appends RENDER NONE).
    const merged = valuesFromFields(template.dynamic_fields, values);
    const prompt = fillPromptTemplate(template.prompt_template, merged, { includeContact });

    // Create the job up front so it is trackable even if rendering is async.
    const { data: job, error } = await supabaseAdmin
        .from('design_jobs')
        .insert({
            user_id: userId,
            status: 'pending',
            metadata: {
                templateKey, templateTitle: template.title,
                imageSize: imageSize || template.canvas_size,
                quality, language, includeContact, logoMode,
                prompt,
            },
        })
        .select('id')
        .single();
    if (error) throw error;

    // No generation backend wired → return the job + prompt for the caller to
    // hand to whatever renders images. Nothing is faked as "completed".
    if (!GENERATE_URL && !isOpenAIConfigured()) {
        return { jobId: job.id, status: 'pending', prompt, generationConfigured: false };
    }

    await supabaseAdmin.from('design_jobs')
        .update({ status: 'processing' }).eq('id', job.id);

    try {
        let flyerUrl = null;
        let flyerBytes = 0;

        if (GENERATE_URL) {
            const res = await fetch(GENERATE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    image_size: imageSize || template.canvas_size,
                    quality, language,
                    logo_url: logoUrl, logo_mode: logoMode,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Generation service error');

            // Accept either a ready URL or base64 image bytes from the service.
            flyerUrl = data.imageUrl || data.flyerUrl || null;
            if (!flyerUrl && data.imageBase64) {
                const buffer = Buffer.from(data.imageBase64, 'base64');
                flyerBytes = buffer.length;
                flyerUrl = await storeImage(userId, job.id, buffer);
            }
        } else {
            // OpenAI path. gpt-image-1 generations can't consume logoUrl —
            // logo placement stays a prompt-level instruction (logoMode 'ai').
            const { buffer, contentType } = await generateImage({
                prompt,
                imageSize: imageSize || template.canvas_size,
                quality,
            });
            flyerBytes = buffer.length;
            flyerUrl = await storeImage(userId, job.id, buffer, contentType);
        }

        await supabaseAdmin.from('design_jobs').update({
            status: 'completed', flyer_url: flyerUrl, completed_at: new Date().toISOString(),
        }).eq('id', job.id);

        // Register the flyer in the user's media library so it shows up in the
        // Library tab and counts toward their storage. Best-effort: a failure
        // here must not lose the already-rendered image the caller is waiting on.
        if (flyerUrl) {
            await registerLibraryEntry({
                userId, workspaceId, jobId: job.id, url: flyerUrl,
                sizeBytes: flyerBytes, title: template.title,
            }).catch((e) => console.error('[design] library registration failed:', e.message));
        }

        return { jobId: job.id, status: 'completed', flyerUrl, prompt, generationConfigured: true };
    } catch (err) {
        await supabaseAdmin.from('design_jobs').update({
            status: 'failed', error_message: err.message,
        }).eq('id', job.id);
        const e = new Error(err.message);
        e.status = 502;
        throw e;
    }
};

/** The caller's recent design jobs. */
export const listJobs = async (userId) => {
    const { data, error } = await supabaseAdmin
        .from('design_jobs')
        .select('id, status, flyer_url, error_message, credits_used, metadata, created_at, completed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return data || [];
};

export const getJob = async (userId, id) => {
    const { data, error } = await supabaseAdmin
        .from('design_jobs')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
    if (error || !data) { const e = new Error('Job not found'); e.status = 404; throw e; }
    return data;
};

/**
 * Daily sweep: delete generated flyer images older than DESIGN_RETENTION_DAYS
 * (default 30) from storage, freeing the paid space. The job row is kept for
 * history but marked 'expired' with its flyer_url cleared.
 *
 * Conservative on two counts:
 *  - an image still referenced by a not-yet-published scheduled post is kept,
 *    so the scheduler never publishes a dead media URL;
 *  - the row is only marked expired after its object is confirmed gone, so a
 *    failed delete simply retries on the next sweep.
 */
export const sweepExpiredDesigns = async () => {
    try {
        const cutoff = new Date(Date.now() - DESIGN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { data: jobs, error } = await supabaseAdmin
            .from('design_jobs')
            .select('id, user_id, flyer_url')
            .eq('status', 'completed')
            .not('flyer_url', 'is', null)
            .lt('created_at', cutoff);
        if (error) throw error;
        if (!jobs?.length) return;

        // URLs still queued for publishing must survive the sweep.
        const { data: pending } = await supabaseAdmin
            .from('scheduled_posts')
            .select('media_urls')
            .in('status', ['pending', 'processing']);
        const inUse = new Set();
        for (const p of pending || []) for (const u of p.media_urls || []) inUse.add(u);

        let deleted = 0;
        for (const job of jobs) {
            if (inUse.has(job.flyer_url)) continue;
            try {
                await removeImage(job.user_id, job.id, job.flyer_url);
                // Drop the library entry too, freeing the user's storage usage.
                await supabaseAdmin
                    .from('media_library')
                    .delete()
                    .eq('object_key', designObjectKey(job.user_id, job.id));
                const { error: upError } = await supabaseAdmin
                    .from('design_jobs')
                    .update({ status: 'expired', flyer_url: null })
                    .eq('id', job.id);
                if (upError) throw upError;
                deleted += 1;
            } catch (err) {
                console.error(`[design] sweep: could not delete image for job ${job.id}:`, err.message);
            }
        }
        if (deleted) {
            console.log(`[design] sweep: purged ${deleted} flyer image(s) older than ${DESIGN_RETENTION_DAYS} days`);
        }
    } catch (err) {
        // Missing table (migration not applied yet) or a transient outage: the
        // sweep simply tries again tomorrow.
        console.error('[design] retention sweep failed:', err.message);
    }
};
