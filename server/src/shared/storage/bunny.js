/**
 * Bunny.net storage backend for the media library.
 *
 * Objects are PUT to the Storage Zone over its regional API host and served
 * publicly through the Pull Zone CDN URL. Driven with plain fetch — the API
 * is two verbs and a header, no SDK required.
 *
 * Configuration (zone + key + pull-zone URL required to activate; otherwise
 * callers fall back to Supabase Storage):
 *   BUNNY_STORAGE_ZONE     storage zone name
 *   BUNNY_API_KEY          the zone's password (NOT the account API key)
 *   BUNNY_PULL_ZONE_URL    pull-zone base, e.g. https://yourzone.b-cdn.net
 *   BUNNY_REGION           optional storage region prefix (e.g. sg, ny, la);
 *                          empty/de = the default storage.bunnycdn.com
 * (The BUNNY_STORAGE_API_KEY / BUNNY_CDN_BASE_URL / BUNNY_STORAGE_HOST
 *  spellings are accepted too.)
 */

import '../../config/env.js';

const config = () => {
    const zone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY || process.env.BUNNY_STORAGE_API_KEY;

    let cdnBase = (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_BASE_URL || '')
        .trim().replace(/\/+$/, '');
    if (cdnBase && !/^https?:\/\//.test(cdnBase)) cdnBase = `https://${cdnBase}`;

    const region = (process.env.BUNNY_REGION || '').trim().toLowerCase();
    const host = process.env.BUNNY_STORAGE_HOST
        || (region && region !== 'de' ? `${region}.storage.bunnycdn.com` : 'storage.bunnycdn.com');

    if (!zone || !apiKey || !cdnBase) return null;
    return { zone, apiKey, host, cdnBase };
};

export const isBunnyConfigured = () => Boolean(config());

export const bunnyPublicUrl = (objectKey) => {
    const cfg = config();
    return cfg ? `${cfg.cdnBase}/${objectKey}` : null;
};

/** True when a stored URL was served by the configured pull zone. */
export const isBunnyUrl = (url) => {
    const cfg = config();
    return Boolean(cfg && url?.startsWith(`${cfg.cdnBase}/`));
};

export const bunnyUpload = async (objectKey, buffer, contentType) => {
    const cfg = config();
    if (!cfg) throw new Error('Bunny storage is not configured');

    const res = await fetch(`https://${cfg.host}/${cfg.zone}/${objectKey}`, {
        method: 'PUT',
        headers: {
            AccessKey: cfg.apiKey,
            'Content-Type': contentType || 'application/octet-stream',
        },
        body: buffer,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Bunny upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return bunnyPublicUrl(objectKey);
};

export const bunnyRemove = async (objectKey) => {
    const cfg = config();
    if (!cfg) throw new Error('Bunny storage is not configured');

    const res = await fetch(`https://${cfg.host}/${cfg.zone}/${objectKey}`, {
        method: 'DELETE',
        headers: { AccessKey: cfg.apiKey },
    });
    // 404 = already gone; deleting an absent object is a success for callers.
    if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '');
        throw new Error(`Bunny delete failed (${res.status}): ${text.slice(0, 200)}`);
    }

    await purgeCdnCache(`${cfg.cdnBase}/${objectKey}`);
};

/**
 * Best-effort CDN cache purge, so a deleted file stops being served from
 * edge caches immediately instead of when its TTL lapses. Needs the ACCOUNT
 * API key (bunny.net dashboard → Account → API), which is a different
 * credential from the storage zone password; without it the purge is
 * skipped silently and caches simply age out.
 */
const purgeCdnCache = async (url) => {
    const accountKey = process.env.BUNNY_ACCOUNT_API_KEY;
    if (!accountKey) return;
    try {
        const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}`, {
            method: 'POST',
            headers: { AccessKey: accountKey },
        });
        if (!res.ok) console.warn(`[bunny] cache purge returned ${res.status} for ${url}`);
    } catch (err) {
        console.warn('[bunny] cache purge failed:', err.message);
    }
};
