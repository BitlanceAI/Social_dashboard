import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

const request = async (path, { method = 'GET', body, workspaceId } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        const err = new Error('Not signed in');
        err.status = 401;
        throw err;
    }

    const res = await fetch(`${API_BASE_URL}/api/storage${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
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

export const fetchStorageConfig = () => request('/config');
export const fetchMyStorage = () => request('/me');
export const createStorageOrder = ({ gb, months }) =>
    request('/orders', { method: 'POST', body: { gb, months } });
export const verifyStoragePayment = ({ orderId, paymentId, signature }) =>
    request('/verify', { method: 'POST', body: { orderId, paymentId, signature } });

export const fmtBytes = (bytes) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// The library is workspace-scoped: list and upload carry the active
// workspace so files never leak between workspaces.
export const fetchMedia = (workspaceId) => request('/media', { workspaceId });

export const deleteMedia = (id) => request(`/media/${id}`, { method: 'DELETE' });

/** Multipart upload — bypasses the JSON wrapper but keeps the auth shape. */
export const uploadMedia = async (files, workspaceId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const form = new FormData();
    files.forEach((f) => form.append('files', f));

    const res = await fetch(`${API_BASE_URL}/api/storage/media`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: form,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Upload failed (${res.status})`);
    return payload;
};

/**
 * Load Razorpay's checkout script once. Resolves with window.Razorpay,
 * or rejects if the script cannot load (offline, blocked).
 */
let razorpayPromise = null;
export const loadRazorpay = () => {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);
    if (!razorpayPromise) {
        razorpayPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(window.Razorpay);
            script.onerror = () => {
                razorpayPromise = null;
                reject(new Error('Could not load the payment widget'));
            };
            document.body.appendChild(script);
        });
    }
    return razorpayPromise;
};
