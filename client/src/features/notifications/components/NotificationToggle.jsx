import React, { useEffect, useState } from 'react';
import { Bell, BellOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    pushConfigured, pushSupported, permissionState,
    enablePush, disablePush, onForegroundMessage,
} from '@/features/notifications/lib/push';

/**
 * Notification opt-in.
 *
 * Shows a short pre-prompt before triggering the browser permission dialog.
 * That is deliberate: the browser prompt can only be shown once, and a denial
 * is permanent from JavaScript — so it is worth explaining the value first
 * rather than firing it on page load and burning the one chance.
 */
const NotificationToggle = ({ authHeaders }) => {
    const [supported, setSupported] = useState(false);
    const [permission, setPermission] = useState(permissionState());
    const [enabled, setEnabled] = useState(Boolean(localStorage.getItem('pushToken')));
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        pushSupported().then(setSupported);
        // A message arriving while the tab is focused raises no notification
        // of its own, so surface it as a toast.
        return onForegroundMessage((payload) => {
            const n = payload?.notification;
            if (n?.title) toast(`${n.title}${n.body ? ` — ${n.body}` : ''}`, { duration: 8000 });
        });
    }, []);

    if (!pushConfigured() || !supported) return null;

    const turnOn = async () => {
        setBusy(true);
        const result = await enablePush(authHeaders);
        setPermission(permissionState());
        setBusy(false);

        if (result.ok) {
            setEnabled(true);
            toast.success('Notifications on — we will tell you if a post fails.');
        } else if (result.reason === 'denied') {
            toast.error('Notifications are blocked for this site. Enable them in your browser settings to turn this on.', { duration: 9000 });
        } else if (result.reason === 'default') {
            toast('No problem — you can turn this on any time.');
        } else {
            toast.error(`Could not enable notifications: ${result.reason}`);
        }
    };

    const turnOff = async () => {
        setBusy(true);
        await disablePush(authHeaders);
        setEnabled(false);
        setBusy(false);
        toast.success('Notifications off for this browser.');
    };

    const blocked = permission === 'denied';

    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-start gap-4">
                <span className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
                    {enabled ? <Bell className="h-5 w-5 text-[var(--accent)]" />
                             : <BellOff className="h-5 w-5 text-[var(--muted)]" />}
                </span>

                <div className="min-w-0 flex-1">
                    <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight text-[var(--text)] mb-1">
                        Failure alerts
                    </h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed mb-4">
                        Get a browser notification if a scheduled post fails to publish, so you
                        find out straight away instead of the next time you open the dashboard.
                    </p>

                    {blocked ? (
                        <p className="flex items-start gap-2 text-sm text-[var(--muted)]">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                            Notifications are blocked for this site. Your browser will not let us
                            ask again — turn them on in the site settings (the icon beside the
                            address bar), then reload.
                        </p>
                    ) : enabled ? (
                        <button
                            onClick={turnOff}
                            disabled={busy}
                            className="px-5 py-2 rounded-full border border-[var(--border)] text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                            {busy ? 'Turning off…' : 'Turn off'}
                        </button>
                    ) : (
                        <button
                            onClick={turnOn}
                            disabled={busy}
                            className="px-5 py-2 rounded-full bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                        >
                            {busy ? 'Enabling…' : 'Enable notifications'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationToggle;
