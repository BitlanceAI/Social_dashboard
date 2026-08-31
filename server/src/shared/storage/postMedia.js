/**
 * Post media uploads — shared across publishing providers.
 *
 * Nothing here is provider-specific: files land in the public `post-media`
 * Supabase Storage bucket and the caller gets back public URLs. Meta is
 * handed those URLs and fetches them itself; the LinkedIn path reads the
 * bytes back and PUTs them to LinkedIn. Either way the bucket must stay
 * public.
 *
 * NOTE: modules/meta still carries its own inline copy of this logic. That
 * duplication is deliberate for now — the Meta publishing path is working and
 * was explicitly out of scope for the LinkedIn change. Switch it over in a
 * separate, behaviour-free pass.
 */

import '../../config/env.js';

import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export const POST_MEDIA_BUCKET = 'post-media';

/** Memory storage — the buffers go straight on to Storage, never to disk. */
export const postMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * Upload files to the post-media bucket.
 *
 * Keys are `{workspace}/{user}/{ts}-{name}` — workspace first so an object's
 * tenant is readable from its path, user second for audit. This is
 * organisational only: the bucket is public and its sole policy is public read,
 * because Meta and LinkedIn both fetch media by URL.
 *
 * Forward-only. media_urls stores absolute URLs, so existing objects keep
 * resolving at their old keys; moving them would break every historical post.
 *
 * @param {string} userId       who uploaded it
 * @param {Array}  files        multer file objects
 * @param {string} [workspaceId] tenant; omitted keys fall back to the old shape
 * @returns {Promise<{success: boolean, urls?: string[], error?: string}>}
 */
export async function uploadPostMedia(userId, files = [], workspaceId) {
    if (!files.length) {
        return { success: false, error: 'No files provided' };
    }

    const urls = [];

    for (const file of files) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '');
        const prefix = workspaceId ? `${workspaceId}/${userId}` : userId;
        const objectKey = `${prefix}/${Date.now()}-${safeName}`;

        const { error } = await supabase.storage
            .from(POST_MEDIA_BUCKET)
            .upload(objectKey, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            return { success: false, error: error.message };
        }

        const { data } = supabase.storage
            .from(POST_MEDIA_BUCKET)
            .getPublicUrl(objectKey);

        urls.push(data.publicUrl);
    }

    return { success: true, urls };
}

export default uploadPostMedia;
