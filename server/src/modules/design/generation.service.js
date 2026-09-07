/**
 * OpenAI image generation — the Node-native renderer for design jobs.
 *
 * Talks straight to the OpenAI Images API with the server's OPENAI_API_KEY
 * (server/.env), replacing the external Python service for rendering.
 * Kept free of Supabase/job concerns: give it a prompt, get back image bytes.
 *
 * The gpt-image models render 1024x1024, 1024x1536 (portrait) and 1536x1024
 * (landscape), while templates carry freeform canvas sizes like "1080x1350" —
 * toOpenAISize() picks the supported size with the nearest aspect ratio.
 */

import '../../config/env.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const REQUEST_TIMEOUT_MS = 180_000; // image renders routinely take >60s

const SUPPORTED_SIZES = [[1024, 1024], [1024, 1536], [1536, 1024]];
const QUALITIES = new Set(['low', 'medium', 'high', 'auto']);

export const isOpenAIConfigured = () => Boolean(OPENAI_API_KEY);

/** Map a freeform "WxH" canvas size to the supported size closest in aspect ratio. */
export const toOpenAISize = (imageSize) => {
    const m = /^(\d+)\s*x\s*(\d+)$/i.exec(String(imageSize || '').trim());
    if (!m) return 'auto';
    const ratio = Number(m[1]) / Number(m[2]);
    const [w, h] = SUPPORTED_SIZES.reduce((best, wh) => (
        Math.abs(wh[0] / wh[1] - ratio) < Math.abs(best[0] / best[1] - ratio) ? wh : best
    ));
    return `${w}x${h}`;
};

/**
 * Render one image. Returns { buffer, contentType, size, model }.
 * Throws with a `.status` for the controller's error mapping.
 */
export const generateImage = async ({ prompt, imageSize, quality = 'high' } = {}) => {
    if (!OPENAI_API_KEY) {
        const e = new Error('Image generation is not configured (OPENAI_API_KEY missing)');
        e.status = 503;
        throw e;
    }
    if (!prompt || !String(prompt).trim()) {
        const e = new Error('A prompt is required');
        e.status = 400;
        throw e;
    }

    const size = toOpenAISize(imageSize);
    const body = {
        model: OPENAI_IMAGE_MODEL,
        prompt: String(prompt).trim(),
        n: 1,
        size,
        quality: QUALITIES.has(quality) ? quality : 'high',
    };

    let res;
    try {
        res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        const e = new Error(err.name === 'TimeoutError'
            ? 'Image generation timed out'
            : `Could not reach OpenAI: ${err.message}`);
        e.status = 502;
        throw e;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = new Error(data?.error?.message || `OpenAI error (HTTP ${res.status})`);
        // Pass auth/rate-limit statuses through as a gateway failure, not our own
        e.status = res.status === 400 ? 400 : 502;
        throw e;
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
        const e = new Error('OpenAI returned no image data');
        e.status = 502;
        throw e;
    }

    return {
        buffer: Buffer.from(b64, 'base64'),
        contentType: 'image/png',
        size,
        model: OPENAI_IMAGE_MODEL,
    };
};
