import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Bell, XCircle, AlertTriangle, HardDrive } from 'lucide-react';
import { fetchMyStorage } from '@/features/storage';

const DAY_MS = 24 * 60 * 60 * 1000;

const timeAgo = (iso, now) => {
    if (!iso) return '';
    const diff = now - new Date(iso).getTime();
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < DAY_MS) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / DAY_MS)}d ago`;
};

const SEEN_KEY = 'notificationsSeen';

const readSeen = () => {
    try {
        return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch {
        return new Set();
    }
};

/**
 * In-app notification bell: failed posts, connection-token warnings, and
 * storage expiry, derived from state the dashboard already holds (plus one
 * storage fetch). Opening the panel marks the current items seen — the badge
 * counts only what appeared since.
 */
const NotificationsBell = ({ posts = [], liConnection = null }) => {
    const [open, setOpen] = useState(false);
    const [storage, setStorage] = useState(null);
    const [seenIds, setSeenIds] = useState(readSeen);
    const containerRef = useRef(null);

    useEffect(() => {
        fetchMyStorage().then(setStorage).catch(() => {});
    }, []);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    // The derivation needs the clock, which render must not read directly:
    // `now` lives in state (seeded once) and a minute interval keeps it and
    // the relative timestamps honest while the panel sits open.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    const items = useMemo(() => {
        const list = [];

        for (const post of posts) {
            if (post.status !== 'failed') continue;
            list.push({
                id: `post-failed-${post.id}`,
                tone: 'danger',
                icon: XCircle,
                title: `Post to ${post.page_name || 'your page'} failed`,
                detail: post.error_message || 'The post could not be published.',
                at: post.updated_at || post.scheduled_time,
            });
        }

        if (liConnection?.token_expires_at) {
            const msLeft = new Date(liConnection.token_expires_at).getTime() - now;
            if (msLeft <= 0) {
                list.push({
                    id: `li-expired-${liConnection.token_expires_at}`,
                    tone: 'danger',
                    icon: AlertTriangle,
                    title: 'LinkedIn connection expired',
                    detail: 'Queued LinkedIn posts will fail until you reconnect.',
                    at: liConnection.token_expires_at,
                });
            } else if (msLeft <= 7 * DAY_MS) {
                const days = Math.ceil(msLeft / DAY_MS);
                list.push({
                    id: `li-expiring-${liConnection.token_expires_at}`,
                    tone: 'warning',
                    icon: AlertTriangle,
                    title: `LinkedIn token expires in ${days} day${days === 1 ? '' : 's'}`,
                    detail: 'LinkedIn tokens cannot be renewed — reconnect to keep publishing.',
                    at: null,
                });
            }
        }

        if (storage?.purgeAt) {
            list.push({
                id: `storage-lapsed-${storage.purgeAt}`,
                tone: 'danger',
                icon: HardDrive,
                title: 'Media storage expired',
                detail: `Your library will be deleted on ${new Date(storage.purgeAt).toLocaleDateString()} unless you renew.`,
                at: storage.expiredAt,
            });
        } else if (storage?.nextExpiry
            && new Date(storage.nextExpiry).getTime() - now <= 7 * DAY_MS) {
            list.push({
                id: `storage-expiring-${storage.nextExpiry}`,
                tone: 'warning',
                icon: HardDrive,
                title: 'Media storage expiring soon',
                detail: `Your plan lapses on ${new Date(storage.nextExpiry).toLocaleDateString()}.`,
                at: null,
            });
        }

        list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
        return list.map((item) => ({ ...item, timeLabel: timeAgo(item.at, now) }));
    }, [posts, liConnection, storage, now]);

    const unseen = items.filter((i) => !seenIds.has(i.id)).length;

    const handleOpen = () => {
        setOpen((v) => !v);
        if (!open && items.length) {
            // Current items are now seen; keep the stored set from growing forever.
            const next = new Set([...seenIds, ...items.map((i) => i.id)]);
            const trimmed = [...next].slice(-100);
            setSeenIds(new Set(trimmed));
            try { localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed)); } catch { /* best effort */ }
        }
    };

    const toneColor = { danger: '#F87171', warning: '#FBBF24' };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={handleOpen}
                aria-label={unseen ? `Notifications: ${unseen} new` : 'Notifications'}
                className="relative p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
                <Bell className="h-4 w-4" />
                {unseen > 0 && (
                    <span
                        className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center text-[#070707]"
                        style={{ background: '#F87171' }}
                    >
                        {unseen > 9 ? '9+' : unseen}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 z-40 mt-2 w-80 max-w-[85vw] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center">
                        <span className="flex-1 text-[13px] font-semibold text-[var(--text)]">Notifications</span>
                        {items.length > 0 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--muted)]">
                                {items.length}
                            </span>
                        )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                                All clear — nothing needs your attention.
                            </div>
                        ) : (
                            items.map(({ id, tone, icon, title, detail, timeLabel }) => {
                                const ItemIcon = icon;
                                return (
                                <div key={id} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
                                    <ItemIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: toneColor[tone] }} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-medium text-[var(--text)]">{title}</p>
                                        <p className="text-[12px] text-[var(--muted)] leading-relaxed break-words">{detail}</p>
                                        {timeLabel && <p className="text-[10px] font-mono text-[var(--muted-2)] mt-1">{timeLabel}</p>}
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsBell;
