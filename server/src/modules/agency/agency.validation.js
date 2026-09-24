export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const text = (value, max = 4000, required = false) => {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`Enter ${required ? '1 to ' : 'up to '}${max} characters`);
    return value.trim();
};
export const uuid = (value) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) fail('Invalid record ID');
    return value;
};
export const optionalId = (value) => value == null || value === '' ? null : uuid(value);
export const date = (value) => {
    if (!value) return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('Invalid date');
    return new Date(value).toISOString();
};
export const oneOf = (value, choices) => choices.includes(value) ? value : fail('Invalid selection');
export const urls = (value) => {
    if (!Array.isArray(value) || value.length > 10) fail('Use at most 10 reference URLs');
    return value.map(v => {
        try { const u = new URL(v); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail('Invalid reference URL'); }
        catch { fail('Use a complete HTTP or HTTPS reference URL'); }
        return text(v, 2048, true);
    });
};
export const briefPatch = (body, role, userId, existing) => {
    const agency = ['owner', 'admin', 'member'].includes(role);
    if (existing && !agency && (existing.created_by !== userId || !['submitted','needs_info'].includes(existing.status))) fail('This request can only be changed by the agency now', 403);
    const patch = {};
    for (const key of ['title', 'objective', 'instructions']) {
        if (body[key] !== undefined) patch[key] = text(body[key], key === 'title' ? 160 : 10000, key === 'title');
    }
    if (!existing && !patch.title) fail('Request title is required');
    for (const key of ['due_at', 'desired_publish_at']) if (body[key] !== undefined) patch[key] = date(body[key]);
    if (body.reference_urls !== undefined) patch.reference_urls = urls(body.reference_urls);
    if (body.requested_channels !== undefined) {
        if (!Array.isArray(body.requested_channels)) fail('Channels must be a list');
        patch.requested_channels = [...new Set(body.requested_channels.map(c => oneOf(c, ['facebook','instagram','linkedin'])))];
    }
    if (body.campaign_id !== undefined) patch.campaign_id = optionalId(body.campaign_id);
    if (body.assigned_to !== undefined) {
        if (!agency) fail('Only agency staff can assign requests', 403);
        patch.assigned_to = optionalId(body.assigned_to);
    }
    if (body.status !== undefined) {
        if (!existing) fail('New requests start as submitted');
        patch.status = oneOf(body.status, agency ? ['submitted','needs_info','in_progress','completed','cancelled'] : ['submitted','cancelled']);
        if (['completed', 'cancelled'].includes(existing.status)) fail('This request is closed', 409);
    }
    return patch;
};
