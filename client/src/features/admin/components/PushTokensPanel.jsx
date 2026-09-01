import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchPushTokens } from '../lib/adminApi';

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** Rough browser/OS label from a UA string — enough to tell devices apart. */
const deviceOf = (ua = '') => {
    const browser = /Edg\//.test(ua) ? 'Edge'
        : /Chrome\//.test(ua) ? 'Chrome'
            : /Firefox\//.test(ua) ? 'Firefox'
                : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows'
        : /Android/.test(ua) ? 'Android'
            : /iPhone|iPad/.test(ua) ? 'iOS'
                : /Mac OS/.test(ua) ? 'macOS'
                    : /Linux/.test(ua) ? 'Linux' : '';
    return os ? `${browser} · ${os}` : browser;
};

/** Push Tokens tab: every device registered for web push. */
const PushTokensPanel = () => {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchPushTokens();
            setTokens(res.tokens);
        } catch (err) {
            toast.error(err.message || 'Could not load push tokens');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(load, 0);
        return () => clearTimeout(t);
    }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center">
                <span className="flex-1 text-[11px] font-mono text-[var(--muted)]">
                    {tokens.length} registered device{tokens.length === 1 ? '' : 's'} — FCM prunes stale tokens
                    automatically when a send bounces.
                </span>
                <button
                    onClick={load}
                    className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Device', 'Registered', 'Last used'].map((h) => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tokens.map((t) => (
                                <tr key={t.id} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3.5">
                                        <span className="block text-sm font-medium truncate">{t.userName}</span>
                                        {t.userEmail && <span className="block text-[11px] text-[var(--muted)] truncate">{t.userEmail}</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-sm text-[var(--muted)]" title={t.userAgent || undefined}>
                                        {deviceOf(t.userAgent)}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(t.lastUsedAt)}</td>
                                </tr>
                            ))}
                            {!loading && tokens.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No one has enabled push notifications yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PushTokensPanel;
