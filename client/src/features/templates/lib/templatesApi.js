import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

/** Public gallery reads (no auth needed for active templates). */
export const fetchTemplates = async ({ niche, search } = {}) => {
    const params = new URLSearchParams();
    if (niche && niche !== 'all') params.set('niche', niche);
    if (search) params.set('search', search);
    const res = await fetch(`${API_BASE_URL}/api/templates?${params}`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload.templates || [];
};

export const fetchNiches = async () => {
    const res = await fetch(`${API_BASE_URL}/api/templates/niches`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload.niches || [];
};

/** Generate an image from a template (authenticated). */
export const generateFromTemplate = async (body, workspaceId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const res = await fetch(`${API_BASE_URL}/api/design/generate-from-template`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            // Tag the generated flyer to the active workspace's library.
            ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Generation failed (${res.status})`);
    return payload;
};
