import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

/**
 * Thin fetch wrapper for /api/admin. Every call carries the current
 * Supabase access token; a 403 means the signed-in user is not an admin,
 * which the page turns into an access-denied screen rather than an error.
 */
const request = async (path, { method = 'GET', body } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        const err = new Error('Not signed in');
        err.status = 401;
        throw err;
    }

    const res = await fetch(`${API_BASE_URL}/api/admin${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(payload.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return payload;
};

export const fetchOverview = () => request('/overview');

export const fetchUsers = ({ page = 1, per = 20, search = '' } = {}) => {
    const params = new URLSearchParams({ page, per });
    if (search) params.set('search', search);
    return request(`/users?${params}`);
};

export const createUser = ({ email, password, name, role }) =>
    request('/users', { method: 'POST', body: { email, password, name, role } });

export const fetchConnections = (provider = 'all') =>
    request(`/connections?provider=${provider}`);

export const fetchStorageSettings = () => request('/storage/settings');

export const updateStorageSettings = ({ pricePerGbMonth, deleteAfterDays }) =>
    request('/storage/settings', { method: 'PUT', body: { pricePerGbMonth, deleteAfterDays } });

export const fetchStoragePurchases = () => request('/storage/purchases');
