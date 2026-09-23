// Shared by uploads, Sheets sync and the server import boundary.
export function parseContentCSV(input) {
    const text = String(input).replace(/^\uFEFF/, '');
    const records = [];
    let row = [], field = '', quoted = false, closed = false;
    const cell = () => { row.push(field.trim()); field = ''; closed = false; };
    const record = () => { cell(); if (row.some(Boolean)) records.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') { quoted = false; closed = true; }
            else field += c;
        } else if (c === ',') cell();
        else if (c === '\n' || c === '\r') { record(); if (c === '\r' && text[i + 1] === '\n') i++; }
        else if (c === '"' && !field.trim() && !closed) { field = ''; quoted = true; }
        else if (c === '"' || (closed && c.trim())) throw new Error('Invalid CSV quoting. Export the file as CSV again.');
        else if (!closed) field += c;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted field.');
    if (field || row.length || closed) record();
    if (!records.length) return [];
    const headers = records.shift();
    const keys = headers.map(normalizeKey);
    if (keys.some(k => !k) || new Set(keys).size !== keys.length) throw new Error('CSV headers must be nonempty and unique.');
    return records.map((values, index) => {
        if (values.length !== headers.length) throw new Error(`Row ${index + 2}: expected ${headers.length} columns, found ${values.length}. Quote descriptions containing commas.`);
        return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    });
}

const normalizeKey = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export function normalizeContentItem(source, index = 0) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`Row ${index + 1}: expected an object with named columns.`);
    const fields = Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeKey(key), value]));
    const get = (...keys) => {
        for (const key of keys) if (fields[key] != null && String(fields[key]).trim()) return String(fields[key]).trim();
        return '';
    };
    const item = {
        day: get('day'), dateStr: get('datestr', 'date'),
        titleHook: get('posttitlehook', 'titlehook', 'posttitle', 'hook', 'title'),
        contentPillar: get('contentpillar', 'pillar'),
        captionOutline: get('captionoutline', 'outline'), format: get('format', 'type'),
        cta: get('cta', 'calltoaction'), sourceStatus: get('sourcestatus', 'status'),
    };
    if (!item.titleHook) throw new Error(`Row ${index + 1}: missing Post Title / Hook column. Rename the title column before importing.`);
    if (/^(pending|posted|published|scheduled|approved|rejected|failed|generating|cancelled)$/i.test(item.contentPillar)) {
        throw new Error(`Row ${index + 1}: Content Pillar contains a workflow status (${item.contentPillar}). Check your column mapping; put this value in Status.`);
    }
    if (/^(feature highlight|educational|promotional|testimonial|case study)$/i.test(item.titleHook)) {
        throw new Error(`Row ${index + 1}: "${item.titleHook}" is a content category. Put the specific post topic in Post Title / Hook and the category in Content Pillar.`);
    }
    return item;
}

export function buildPipelineImagePrompt({ titleHook, contentPillar, captionOutline, caption, brandLogoText, customTemplate }) {
    const values = { titleHook, contentPillar, captionOutline, caption, brandLogoText };
    const template = customTemplate || 'Create a professional square social illustration about {{titleHook}}. Use a clean tech style and a clear visual explaining the topic. Include {{brandLogoText}} as a small wordmark.';
    const resolved = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
        if (!(key in values)) throw new Error(`Unsupported image prompt variable: ${key}`);
        return String(values[key] || '');
    });
    return `${resolved}\n\nContent brief (context, not text to copy onto the artwork):\n${JSON.stringify({ topic: titleHook, category: contentPillar, outline: captionOutline, caption })}\nCreate a visual specific to this topic. Use a concise, benefit-led headline of at most 10 words derived from the topic. Do not display category labels or workflow statuses. Display only the headline and the brand name; do not add invented UI labels or claims. Preserve the template's color and style instructions.`;
}
