import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

/** Public — no session required; the pricing page uses this. */
export const fetchPlans = async () => {
    const res = await fetch(`${API_BASE_URL}/api/billing/plans`);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    return payload;
};

/** Authenticated billing calls (Phase 2+). */
const request = async (path, { method = 'GET', body } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        const err = new Error('Not signed in');
        err.status = 401;
        throw err;
    }
    const res = await fetch(`${API_BASE_URL}/api/billing${path}`, {
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

export const fetchMyBilling = () => request('/me');
export const subscribe = ({ planKey, interval }) =>
    request('/subscribe', { method: 'POST', body: { planKey, interval } });
export const verifySubscription = (payload) =>
    request('/verify', { method: 'POST', body: payload });
export const cancelSubscription = () => request('/cancel', { method: 'POST' });

/** INR (paise) → display string. */
export const money = (paise, currency = 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 })
        .format((paise || 0) / 100);

/** Load Razorpay's checkout script once. */
let razorpayPromise = null;
export const loadRazorpay = () => {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);
    if (!razorpayPromise) {
        razorpayPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(window.Razorpay);
            script.onerror = () => { razorpayPromise = null; reject(new Error('Could not load the payment widget')); };
            document.body.appendChild(script);
        });
    }
    return razorpayPromise;
};
