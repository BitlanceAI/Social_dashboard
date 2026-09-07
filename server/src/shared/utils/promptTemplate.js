/**
 * Fill a graphic template's prompt_template by substituting {{token}}
 * placeholders with the user's dynamic-field values.
 *
 * Ported from graphicTemplateUtils.js. Two behaviours preserved:
 *  - Loop substitution: a field's default can itself contain a {{token}}, so
 *    we re-run until the text stops changing (bounded).
 *  - Contact opt-out: when the user declines contact details, every
 *    contact-like field is blanked and the same "RENDER NONE" instruction the
 *    campaign pipeline uses is appended.
 */

const CONTACT_FIELD_RE = /phone|email|mobile|whatsapp|contact|address|website|url|handle/i;
const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
const MAX_PASSES = 10; // guards against a token that references itself

const RENDER_NONE =
    'RENDER NONE: do not render any phone number, email, address, website, ' +
    'social handle or other contact details anywhere in the image.';

export const fillPromptTemplate = (promptTemplate, values = {}, { includeContact = true } = {}) => {
    const vals = { ...values };

    if (!includeContact) {
        for (const key of Object.keys(vals)) {
            if (CONTACT_FIELD_RE.test(key)) vals[key] = '';
        }
    }

    let result = String(promptTemplate || '');
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        const before = result;
        result = result.replace(TOKEN_RE, (match, key) => {
            const v = vals[key];
            return v === undefined || v === null ? match : String(v);
        });
        if (result === before) break;
    }

    if (!includeContact) result += `\n\n${RENDER_NONE}`;
    return result.trim();
};

/**
 * Seed a values object from a template's dynamic_fields defaults, overlaid
 * with user-provided values. Missing user values fall back to the default.
 */
export const valuesFromFields = (dynamicFields = [], userValues = {}) => {
    const out = {};
    for (const field of dynamicFields) {
        out[field.key] = userValues[field.key] !== undefined && userValues[field.key] !== ''
            ? userValues[field.key]
            : (field.default ?? '');
    }
    return out;
};
