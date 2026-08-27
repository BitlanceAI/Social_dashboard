/**
 * Web push (Firebase Cloud Messaging) — browser side.
 *
 * Note on permission: browsers do not allow forcing this. Chrome and Safari
 * require a user gesture, and once a user has chosen "Block" the prompt can
 * never be shown again from JavaScript — only the user can undo it in site
 * settings. So `enablePush` must be called from a click, and callers should
 * handle the 'denied' outcome by telling the user where to change it.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import API_BASE_URL from '../config';

// Only what Cloud Messaging actually needs. `authDomain` (Firebase Auth) and
// `storageBucket` (Cloud Storage) are part of the boilerplate config object
// but unused here — this app uses Supabase for both.
const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/** True only when the build carries Firebase config and the browser supports push. */
export const pushConfigured = () => Boolean(config.apiKey && config.projectId && VAPID_KEY);

export const pushSupported = async () =>
    typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && (await isSupported().catch(() => false));

export const permissionState = () =>
    (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

const getApp = () => (getApps().length ? getApps()[0] : initializeApp(config));

/**
 * The service worker cannot read build-time env vars, so pass the config
 * through the registration URL.
 */
const registerServiceWorker = async () => {
    const qs = new URLSearchParams({
        apiKey: config.apiKey || '',
        projectId: config.projectId || '',
        messagingSenderId: config.messagingSenderId || '',
        appId: config.appId || '',
    }).toString();

    return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
};

/**
 * Ask for permission and register this browser.
 * MUST be called from a user gesture (a click).
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export const enablePush = async (authHeaders) => {
    if (!pushConfigured()) return { ok: false, reason: 'not-configured' };
    if (!(await pushSupported())) return { ok: false, reason: 'unsupported' };

    if (Notification.permission === 'denied') {
        // Unrecoverable from script — the user must change it in site settings
        return { ok: false, reason: 'denied' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: permission };

    try {
        const registration = await registerServiceWorker();
        const messaging = getMessaging(getApp());
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration,
        });

        if (!token) return { ok: false, reason: 'no-token' };

        const res = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!data.success) return { ok: false, reason: data.error || 'register-failed' };

        localStorage.setItem('pushToken', token);
        return { ok: true };
    } catch (error) {
        console.error('[Push] enable failed:', error);
        return { ok: false, reason: error.message };
    }
};

/** Stop notifications for this browser. The OS permission itself stays granted. */
export const disablePush = async (authHeaders) => {
    const token = localStorage.getItem('pushToken');
    try {
        await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ token }),
        });
    } catch (error) {
        console.error('[Push] disable failed:', error);
    }
    localStorage.removeItem('pushToken');
};

/** Foreground messages do not raise a notification on their own. */
export const onForegroundMessage = (handler) => {
    if (!pushConfigured()) return () => {};
    try {
        return onMessage(getMessaging(getApp()), handler);
    } catch {
        return () => {};
    }
};
