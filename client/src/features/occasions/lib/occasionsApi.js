import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Upcoming DATED occasions in the next `days`. Uses the read-only
 * /api/occasions/between endpoint (auth required). Movable festivals with no
 * admin-entered date are excluded by the server, so every result has a date.
 */
export const fetchUpcomingOccasions = async (days = 45) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const now = new Date();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({ from: iso(now), to: iso(to) });
    const res = await fetch(`${API_BASE_URL}/api/occasions/between?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload.occasions || [];
};
