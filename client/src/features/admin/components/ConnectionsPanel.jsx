import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchConnections } from '../lib/adminApi';
import StatusChip from './StatusChip';

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const expiryCell = (c) => {
    if (!c.expiresAt) return <span className="text-xs font-mono text-[var(--muted)]">long-lived</span>;
    const days = Math.ceil((new Date(c.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000));
    if (c.status === 'expired') {
        return <span className="text-xs font-mono" style={{ color: '#F87171' }}>expired {fmtDate(c.expiresAt)}</span>;
    }
    return (
        <span className="text-xs font-mono whitespace-nowrap" style={c.status === 'expiring' ? { color: '#FBBF24' } : undefined}>
            {fmtDate(c.expiresAt)} · {days} day{days === 1 ? '' : 's'}
        </span>
    );
};

/**
 * Connections tab: every Meta and LinkedIn connection with token health.
 * The provider filter re-queries so the summary chips always describe the
 * visible set.
 */
const ConnectionsPanel = () => {
    const [provider, setProvider] = useState('all');
    const [connections, setConnections] = useState([]);
    const [summary, setSummary] = useState({ healthy: 0, expiring: 0, expired: 0 });
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (nextProvider) => {
        setLoading(true);
        try {
            const res = await fetchConnections(nextProvider);
            setConnections(res.connections);
            setSummary(res.summary);
        } catch (err) {
            toast.error(err.message || 'Could not load connections');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => load(provider), 0);
        return () => clearTimeout(t);
    }, [provider, load]);

    const tabClass = (id) =>
        `text-sm px-4 py-1.5 rounded-lg transition-colors ${
            provider === id
                ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-semibold'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
        }`;

    const summaryChip = (label, value, tone) => (
        <span
            className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-full ${tone.className || ''}`}
            style={tone.style}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {value} {label}
        </span>
    );

    return (
        <div className="space-y-4">
            {/* Provider tabs + health summary */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <button onClick={() => setProvider('all')} className={tabClass('all')}>All</button>
                    <button onClick={() => setProvider('meta')} className={tabClass('meta')}>Meta</button>
                    <button onClick={() => setProvider('linkedin')} className={tabClass('linkedin')}>LinkedIn</button>
                </div>
                <div className="flex-1" />
                <div className="flex gap-2">
                    {summaryChip('healthy', summary.healthy, { className: 'bg-[var(--accent-muted)] text-[var(--accent)]' })}
                    {summaryChip('expiring', summary.expiring, { style: { background: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24' } })}
                    {summaryChip('expired', summary.expired, { style: { background: 'rgba(248, 113, 113, 0.1)', color: '#F87171' } })}
                </div>
                <button
                    onClick={() => load(provider)}
                    className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* LinkedIn expiry note */}
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#FBBF24]" />
                <span className="text-[13px] text-[var(--muted)]">
                    LinkedIn tokens expire after 60 days and cannot be renewed silently — the only fix is a user
                    reconnect. Expired connections fail their queued posts with a human-readable message.
                </span>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Account / Page', 'Provider', 'Connected', 'Token expires', 'Status'].map((h) => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {connections.map((c) => (
                                <tr key={`${c.provider}-${c.id}`} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3.5">
                                        <span className="block text-sm font-medium truncate">{c.userName}</span>
                                        {c.userEmail && <span className="block text-[11px] text-[var(--muted)] truncate">{c.userEmail}</span>}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="block text-sm truncate">{c.accountName}</span>
                                        <span className="block text-[11px] text-[var(--muted)]">{c.accountDetail}</span>
                                    </td>
                                    <td className="px-5 py-3.5"><StatusChip status="disconnected" label={c.provider} /></td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(c.connectedAt)}</td>
                                    <td className="px-5 py-3.5">{expiryCell(c)}</td>
                                    <td className="px-5 py-3.5"><StatusChip status={c.status} /></td>
                                </tr>
                            ))}
                            {!loading && connections.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No connections yet.
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

export default ConnectionsPanel;
