/**
 * Graphic template catalog (Supabase port of the Mongoose GraphicTemplate).
 *
 * Search here is a Postgres regex/ILIKE match over title, tags and mood — the
 * Mongo version used Pinecone (semantic) with a regex fallback; this stack has
 * no Pinecone, so the fallback is the primary. Only title/tags/mood are matched,
 * never the prompt body, mirroring the original embedding choice.
 */

import { supabaseAdmin } from '../../config/supabase.js';

const publicTemplate = (t) => ({
    id: t.id,
    key: t.key,
    number: t.number,
    title: t.title,
    niche: t.niche,
    tags: t.tags || [],
    mood: t.mood || [],
    canvasSize: t.canvas_size,
    thumbnailUrl: t.thumbnail_url,
    dynamicFields: t.dynamic_fields || [],
    isActive: t.is_active,
});

/** Gallery listing: filter by niche, optional free-text search. */
export const listTemplates = async ({ niche, search } = {}) => {
    let query = supabaseAdmin
        .from('graphic_templates')
        .select('*')
        .eq('is_active', true)
        .order('number', { ascending: true });

    if (niche && niche !== 'all') query = query.eq('niche', niche);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    const term = (search || '').trim().toLowerCase();
    if (term) {
        rows = rows.filter((t) => {
            const haystack = [t.title, ...(t.tags || []), ...(t.mood || [])].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }
    return rows.map(publicTemplate);
};

/** Turn a niche slug into a display label: "real_estate" → "Real Estate". */
const nicheLabel = (slug) =>
    String(slug || '').split('_').filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || slug;

/**
 * The distinct niches present, for the gallery's niche chips — each with a
 * count and a prettified label. Filtering happens on `value` (the slug).
 */
export const listNiches = async () => {
    const { data, error } = await supabaseAdmin
        .from('graphic_templates')
        .select('niche')
        .eq('is_active', true);
    if (error) throw error;

    const counts = {};
    for (const r of data || []) counts[r.niche] = (counts[r.niche] || 0) + 1;
    return Object.entries(counts)
        .map(([value, count]) => ({ value, label: nicheLabel(value), count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** Full template by key (includes prompt_template — used by generation). */
export const getTemplateByKey = async (key) => {
    const { data, error } = await supabaseAdmin
        .from('graphic_templates')
        .select('*')
        .eq('key', key)
        .single();
    if (error || !data) {
        const err = new Error('Template not found');
        err.status = 404;
        throw err;
    }
    return data;
};

// ── Admin CRUD ───────────────────────────────────────────────────────────────

const toRow = (b) => {
    const row = {};
    if (b.key !== undefined) row.key = b.key;
    if (b.number !== undefined) row.number = parseInt(b.number, 10);
    if (b.title !== undefined) row.title = b.title;
    if (b.niche !== undefined) row.niche = b.niche;
    if (b.tags !== undefined) row.tags = Array.isArray(b.tags) ? b.tags : [];
    if (b.mood !== undefined) row.mood = Array.isArray(b.mood) ? b.mood : [];
    if (b.canvasSize !== undefined) row.canvas_size = b.canvasSize;
    if (b.thumbnailUrl !== undefined) row.thumbnail_url = b.thumbnailUrl || null;
    if (b.dynamicFields !== undefined) row.dynamic_fields = Array.isArray(b.dynamicFields) ? b.dynamicFields : [];
    if (b.promptTemplate !== undefined) row.prompt_template = b.promptTemplate;
    if (b.isActive !== undefined) row.is_active = Boolean(b.isActive);
    return row;
};

export const createTemplate = async (body) => {
    const row = toRow(body);
    if (!row.key || !row.title || !row.prompt_template || row.number === undefined) {
        const err = new Error('key, number, title and promptTemplate are required');
        err.status = 400;
        throw err;
    }
    row.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
        .from('graphic_templates').insert(row).select('*').single();
    if (error) {
        if (error.code === '23505') { const e = new Error('A template with that key already exists'); e.status = 409; throw e; }
        throw error;
    }
    return publicTemplate(data);
};

export const updateTemplate = async (key, body) => {
    const row = toRow(body);
    delete row.key; // the slug is stable
    row.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
        .from('graphic_templates').update(row).eq('key', key).select('*').single();
    if (error) throw error;
    return publicTemplate(data);
};

export const deleteTemplate = async (key) => {
    const { error } = await supabaseAdmin.from('graphic_templates').delete().eq('key', key);
    if (error) throw error;
};

/** Every template (incl. inactive) for the admin catalog. */
export const listAllTemplates = async () => {
    const { data, error } = await supabaseAdmin
        .from('graphic_templates').select('*').order('number', { ascending: true });
    if (error) throw error;
    return (data || []).map((t) => ({ ...publicTemplate(t), promptTemplate: t.prompt_template }));
};
