/**
 * AI copywriting — post captions via the Perplexity API (text) and OpenAI
 * Vision API (image analysis).
 *
 * Text captions use Perplexity's OpenAI-compatible endpoint.
 * Image captions use OpenAI gpt-4o with vision, so the AI can "see" the image
 * and generate context-aware copy without the user having to describe it.
 *
 * Config (server/.env):
 *   PERPLEXITY_API_KEY   required for text-prompt captions
 *   PERPLEXITY_MODEL     optional; defaults to 'sonar'
 *   OPENAI_API_KEY       required for image-based captions
 */

import '../../config/env.js';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || null;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_VISION_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;

const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

export const isPerplexityConfigured = () => Boolean(PERPLEXITY_API_KEY);
export const isVisionConfigured = () => Boolean(OPENAI_API_KEY);
export const isAiConfigured = () => isPerplexityConfigured() || isVisionConfigured();

const platformGuidance = (platforms = []) => {
    const set = new Set(platforms);
    if (set.has('instagram') && set.size === 1) {
        return 'Instagram: punchy, a few relevant emojis, hashtags at the end.';
    }
    if (set.has('linkedin') && set.size === 1) {
        return 'LinkedIn: professional and value-led, minimal emojis, few or no hashtags.';
    }
    if (set.has('facebook') && set.size === 1) {
        return 'Facebook: friendly and conversational, light emoji use.';
    }
    // Mixed selection — keep it broadly usable across networks.
    return 'Keep it usable across Facebook, Instagram and LinkedIn: clear, friendly, not overly casual.';
};

/**
 * Generate a single social caption from a text topic OR an image URL.
 * When imageUrl is provided, uses OpenAI Vision; otherwise uses Perplexity.
 * Returns { caption }. Throws with a `.status` for the controller's error mapping.
 */
export const generateCaption = async ({
    topic, imageUrl, platforms = [], tone = 'friendly', language = 'en',
    includeHashtags = true, includeEmojis = true,
} = {}) => {
    // Route to vision if an image URL is provided
    if (imageUrl) {
        return generateCaptionFromImage({ imageUrl, topic, platforms, tone, language, includeHashtags, includeEmojis });
    }

    if (!PERPLEXITY_API_KEY) {
        const e = new Error('AI writing is not configured (PERPLEXITY_API_KEY missing)');
        e.status = 503;
        throw e;
    }
    if (!topic || !String(topic).trim()) {
        const e = new Error('Tell the AI what the post is about');
        e.status = 400;
        throw e;
    }

    const langName = LANGUAGE_NAMES[language] || 'English';
    const system = [
        'You are a social media copywriter.',
        'Write ONE ready-to-post caption and nothing else.',
        'Do not add any preamble, labels, quotation marks, or explanation — output only the caption text.',
        'Write in plain text only. Do NOT use Markdown — no **bold**, *italics*, `code`, or # headings. Social networks show those symbols literally.',
        platformGuidance(platforms),
        `Tone: ${tone}.`,
        `Write in ${langName}.`,
        includeEmojis ? 'Use a few tasteful emojis.' : 'Do not use any emojis.',
        includeHashtags
            ? 'End with 3-6 relevant hashtags.'
            : 'Do not include any hashtags.',
    ].join(' ');

    const body = {
        model: PERPLEXITY_MODEL,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Write a social media caption about: ${String(topic).trim()}` },
        ],
        temperature: 0.7,
        max_tokens: 500,
    };

    let res;
    try {
        res = await fetch(PERPLEXITY_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        const e = new Error(err.name === 'TimeoutError'
            ? 'AI writing timed out'
            : `Could not reach the AI service: ${err.message}`);
        e.status = 502;
        throw e;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = new Error(data?.error?.message || data?.error || `AI service error (HTTP ${res.status})`);
        e.status = res.status === 400 ? 400 : 502;
        throw e;
    }

    const caption = data?.choices?.[0]?.message?.content?.trim();
    if (!caption) {
        const e = new Error('The AI returned an empty caption');
        e.status = 502;
        throw e;
    }

    // Models occasionally wrap the whole thing in quotes or slip in Markdown
    // despite instructions — social networks render neither, so strip both.
    return { caption: sanitizeCaption(caption) };
};

/**
 * Generate a caption by analysing the image at `imageUrl` using OpenAI Vision.
 * An optional `topic` text prompt is appended to guide the output.
 */
export const generateCaptionFromImage = async ({
    imageUrl, topic, platforms = [], tone = 'friendly', language = 'en',
    includeHashtags = true, includeEmojis = true,
} = {}) => {
    if (!OPENAI_API_KEY) {
        const e = new Error('Image analysis is not configured (OPENAI_API_KEY missing)');
        e.status = 503;
        throw e;
    }
    if (!imageUrl) {
        const e = new Error('imageUrl is required for image-based captioning');
        e.status = 400;
        throw e;
    }

    const LANGUAGE_NAMES_VISION = { en: 'English', hi: 'Hindi', mr: 'Marathi' };
    const langName = LANGUAGE_NAMES_VISION[language] || 'English';
    const set = new Set(platforms);
    let platformGuide = 'Keep it usable across Facebook, Instagram and LinkedIn: clear, friendly, not overly casual.';
    if (set.has('instagram') && set.size === 1) platformGuide = 'Instagram: punchy, a few relevant emojis, hashtags at the end.';
    else if (set.has('linkedin') && set.size === 1) platformGuide = 'LinkedIn: professional and value-led, minimal emojis, few or no hashtags.';
    else if (set.has('facebook') && set.size === 1) platformGuide = 'Facebook: friendly and conversational, light emoji use.';

    const systemText = [
        'You are a social media copywriter.',
        'The user will share an image. Look at it carefully and write ONE ready-to-post social media caption for it.',
        'Do not add any preamble, labels, quotation marks, or explanation — output only the caption text.',
        'Write in plain text only. Do NOT use Markdown.',
        platformGuide,
        `Tone: ${tone}.`,
        `Write in ${langName}.`,
        includeEmojis ? 'Use a few tasteful emojis.' : 'Do not use any emojis.',
        includeHashtags ? 'End with 3-6 relevant hashtags.' : 'Do not include any hashtags.',
    ].join(' ');

    const userContent = [
        { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
        ...(topic?.trim() ? [{ type: 'text', text: `Additional context: ${topic.trim()}` }] : []),
        { type: 'text', text: 'Write a social media caption for this image.' },
    ];

    let res;
    try {
        res = await fetch(OPENAI_VISION_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemText },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.7,
                max_tokens: 500,
            }),
            signal: AbortSignal.timeout(45_000),
        });
    } catch (err) {
        const e = new Error(err.name === 'TimeoutError' ? 'Vision AI timed out' : `Could not reach the Vision AI service: ${err.message}`);
        e.status = 502;
        throw e;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = new Error(data?.error?.message || `Vision AI error (HTTP ${res.status})`);
        e.status = res.status === 400 ? 400 : 502;
        throw e;
    }

    const caption = data?.choices?.[0]?.message?.content?.trim();
    if (!caption) {
        const e = new Error('The Vision AI returned an empty caption');
        e.status = 502;
        throw e;
    }

    return { caption: sanitizeCaption(caption) };
};

/** Strip surrounding quotes and Markdown emphasis/headings that platforms show raw. */
const sanitizeCaption = (text) => text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold**
    .replace(/__(.*?)__/g, '$1')       // __bold__
    .replace(/\*(.*?)\*/g, '$1')       // *italic*
    .replace(/`([^`]*)`/g, '$1')       // `code`
    .replace(/^#{1,6}\s+/gm, '')       // # headings (leaves #hashtags — those have no space)
    .replace(/^\s*[-*]\s+/gm, '')      // bullet markers at line start
    .replace(/^["']|["']$/g, '')       // wrapping quotes
    .trim();
