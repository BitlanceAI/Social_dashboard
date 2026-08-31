import { Facebook, Instagram, Linkedin } from 'lucide-react';

/**
 * One place that knows what each publishing target is called, looks like, and
 * will accept. Adding a fourth network should mean adding a row here, not
 * hunting down another `platform === 'instagram' ? … : …` ternary.
 *
 * `provider` is the API prefix the platform belongs to and the value stored in
 * scheduled_posts.provider — several platforms can share one provider, as
 * facebook and instagram both do.
 */
export const PLATFORMS = {
    facebook: {
        id: 'facebook',
        provider: 'meta',
        label: 'Facebook',
        Icon: Facebook,
        brand: '#1877F2',
        requiresMedia: false,
        maxChars: 63206,
        // Instagram is the odd one out: the Graph API exposes no delete for
        // media, so a published IG post can only be removed in the app.
        deletable: true,
    },
    instagram: {
        id: 'instagram',
        provider: 'meta',
        label: 'Instagram',
        Icon: Instagram,
        brand: '#E1306C',
        requiresMedia: true,
        maxChars: 2200,
        deletable: false,
    },
    linkedin: {
        id: 'linkedin',
        provider: 'linkedin',
        label: 'LinkedIn',
        Icon: Linkedin,
        brand: '#0A66C2',
        requiresMedia: false,
        maxChars: 3000,
        deletable: true,
    },
};

export const platformMeta = (id) => PLATFORMS[id] ?? PLATFORMS.facebook;

/** Which API a post belongs to. One post targets one provider. */
export const providerOf = (platforms = []) => platformMeta(platforms[0]).provider;

/** The tightest character limit across the selected platforms. */
export const charLimitFor = (platforms = []) => (platforms.length
    ? Math.min(...platforms.map((p) => platformMeta(p).maxChars))
    : PLATFORMS.facebook.maxChars);

export const API_PREFIX = {
    meta: '/api/meta',
    linkedin: '/api/linkedin',
};

export const prefixFor = (provider) => API_PREFIX[provider] ?? API_PREFIX.meta;
