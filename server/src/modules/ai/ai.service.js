/**
 * AI copywriting — post captions via the Perplexity API.
 *
 * Perplexity exposes an OpenAI-compatible chat-completions endpoint, so this is
 * one POST with a Bearer key. No SDK. The model is asked for a ready-to-post
 * caption and nothing else (no preamble, no "Here's your caption:"), so the
 * result can drop straight into the composer.
 *
 * Config (server/.env):
 *   PERPLEXITY_API_KEY   required to enable the feature
 *   PERPLEXITY_MODEL     optional; defaults to 'sonar'
 */

import '../../config/env.js';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || null;
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;

const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

export const isPerplexityConfigured = () => Boolean(PERPLEXITY_API_KEY);

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
 * Generate a single social caption. Returns { caption }.
 * Throws with a `.status` for the controller's error mapping.
 */
export const generateCaption = async ({
    topic, platforms = [], tone = 'friendly', language = 'en',
    includeHashtags = true, includeEmojis = true,
} = {}) => {
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
