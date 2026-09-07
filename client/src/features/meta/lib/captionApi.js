import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    return { Authorization: `Bearer ${session.access_token}` };
};

/** Whether AI writing is configured on the server (hides the button if not). */
export const fetchAiStatus = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/api/ai/status`, { headers: await authHeaders() });
        const payload = await res.json().catch(() => ({}));
        return Boolean(payload.configured);
    } catch {
        return false;
    }
};

/** Ask the AI to write a caption. Returns the caption string. */
export const generateCaption = async (body) => {
    const res = await fetch(`${API_BASE_URL}/api/ai/caption`, {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload.caption || '';
};
