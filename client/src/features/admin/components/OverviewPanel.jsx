import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { notifyUser } from '../lib/adminApi';
import StatusChip from './StatusChip';

const Card = ({ children, className = '' }) => (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}>
        {children}
    </div>
);

const StatTile = ({ label, value, detail, valueClass = '' }) => (
    <Card className="flex flex-col gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">{label}</span>
        <span className={`text-3xl font-bold tracking-tight ${valueClass}`}>{value}</span>
        {detail && <span className="text-xs text-[var(--muted)]">{detail}</span>}
    </Card>
);

const fmtDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

/**
 * Overview tab: stat tiles, LinkedIn tokens nearing expiry (they cannot be
 * refreshed — reconnect is the only fix), and the latest queue activity.
 */
const OverviewPanel = ({ data, onOpenConnections }) => {
    const { stats, expiringTokens, recentActivity } = data;
    const [notifying, setNotifying] = useState({}); // userId -> in flight

    // One-click reconnect nudge, delivered over web push.
    const handleNotify = async (t) => {
        if (notifying[t.userId]) return;
        setNotifying((n) => ({ ...n, [t.userId]: true }));
        try {
            const res = await notifyUser({
                userId: t.userId,
                title: 'Your LinkedIn connection is about to expire',
                body: `It lapses in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'} and cannot be renewed automatically — reconnect to keep your posts publishing.`,
            });
            toast.success(res.message);
        } catch (err) {
            toast.error(err.message || 'Could not notify');
        } finally {
            setNotifying((n) => ({ ...n, [t.userId]: false }));
        }
    };

    return (
        <div className="space-y-6">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <StatTile
                    label="Total users"
                    value={stats.totalUsers}
                    detail={stats.newUsersThisWeek > 0 ? `+${stats.newUsersThisWeek} this week` : 'no new signups this week'}
                />
                <StatTile
                    label="Active connections"
                    value={stats.metaConnections + stats.linkedinConnections}
                    detail={`${stats.metaConnections} Meta · ${stats.linkedinConnections} LinkedIn`}
                />
                <StatTile label="Posts in queue" value={stats.queueDepth} />
                <StatTile
                    label="Failed · last 24h"
                    value={stats.failedLast24h}
                    valueClass={stats.failedLast24h > 0 ? 'text-[#F87171]' : ''}
                />
            </div>

            {/* Expiring LinkedIn tokens */}
            <Card>
                <div className="flex items-center gap-2.5 mb-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#FBBF24]" />
                    <h2 className="flex-1 text-[15px] font-semibold">LinkedIn tokens expiring within 7 days</h2>
                    {expiringTokens.length > 0 && (
                        <StatusChip status="expiring" label={`${expiringTokens.length} account${expiringTokens.length === 1 ? '' : 's'}`} />
                    )}
                </div>
                <p className="text-xs text-[var(--muted)] mb-4">
                    LinkedIn tokens cannot be refreshed — these users must reconnect before their queue stalls.
                </p>

                {expiringTokens.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                        No tokens are close to expiry.
                    </div>
                ) : (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                        {expiringTokens.map((t, i) => (
                            <div
                                key={t.connectionId}
                                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                            >
                                <span className="w-7 h-7 rounded-full bg-[var(--surface-2)] text-[var(--muted)] text-xs font-semibold flex items-center justify-center shrink-0">
                                    {(t.name?.[0] || '?').toUpperCase()}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-medium truncate">{t.name}</span>
                                    {t.email && <span className="block text-[11px] text-[var(--muted)] truncate">{t.email}</span>}
                                </span>
                                <span
                                    className="text-[11px] font-mono shrink-0"
                                    style={{ color: t.daysLeft <= 2 ? '#F87171' : '#FBBF24' }}
                                >
                                    expires in {t.daysLeft} day{t.daysLeft === 1 ? '' : 's'}
                                </span>
                                <button
                                    onClick={() => handleNotify(t)}
                                    disabled={notifying[t.userId]}
                                    className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                                >
                                    {notifying[t.userId] ? 'Sending…' : 'Notify'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={onOpenConnections}
                    className="mt-4 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                >
                    View all connections →
                </button>
            </Card>

            {/* Recent activity */}
            <Card>
                <h2 className="text-[15px] font-semibold mb-4">Recent activity</h2>
                {recentActivity.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                        Nothing scheduled yet.
                    </div>
                ) : (
                    <div className="rounded-xl border border-[var(--border)] overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[var(--surface-2)]">
                                    {['User', 'Target', 'Provider', 'Scheduled for', 'Status'].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recentActivity.map((p) => (
                                    <tr key={p.id} className="border-t border-[var(--border)]">
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">{p.userName}</td>
                                        <td className="px-4 py-3 text-sm text-[var(--muted)]">{p.target}</td>
                                        <td className="px-4 py-3"><StatusChip status="disconnected" label={p.provider} /></td>
                                        <td className="px-4 py-3 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDateTime(p.scheduledTime)}</td>
                                        <td className="px-4 py-3" title={p.errorMessage || undefined}><StatusChip status={p.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default OverviewPanel;
