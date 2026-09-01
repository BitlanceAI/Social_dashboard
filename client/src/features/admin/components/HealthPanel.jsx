import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, Database, CalendarClock, Plug } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchHealth } from '../lib/adminApi';
import StatusChip from './StatusChip';

const Card = ({ icon, title, children }) => {
    const Icon = icon;
    return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2.5 mb-4">
            <Icon className="h-4 w-4 text-[var(--muted)]" />
            <h2 className="text-[15px] font-semibold">{title}</h2>
        </div>
        {children}
    </div>
    );
};

const Row = ({ label, children }) => (
    <div className="flex items-center justify-between py-2 border-t border-[var(--border)] first:border-t-0">
        <span className="text-[13px] text-[var(--muted)]">{label}</span>
        <span className="text-xs font-mono text-[var(--text)]">{children}</span>
    </div>
);

const fmtUptime = (s) => {
    if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 60)}m`;
};

/** System Health tab: server, database, scheduler, and integrations. */
const HealthPanel = () => {
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setHealth(await fetchHealth());
        } catch (err) {
            toast.error(err.message || 'Could not load health');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(load, 0);
        return () => clearTimeout(t);
    }, [load]);

    if (!health) {
        return (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
                {loading ? 'Checking system health…' : 'Health data unavailable.'}
            </div>
        );
    }

    const { server, database, scheduler, integrations } = health;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={load}
                    className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <Card icon={Activity} title="API server">
                    <Row label="Status"><StatusChip status="healthy" label="running" /></Row>
                    <Row label="Uptime">{fmtUptime(server.uptimeSeconds)}</Row>
                    <Row label="Node">{server.node}</Row>
                    <Row label="Environment">{server.env}</Row>
                </Card>

                <Card icon={Database} title="Database (Supabase)">
                    <Row label="Status">
                        <StatusChip status={database.ok ? 'healthy' : 'failed'} label={database.ok ? 'reachable' : 'error'} />
                    </Row>
                    <Row label="Query latency">{database.latencyMs} ms</Row>
                    {database.error && <Row label="Error">{database.error}</Row>}
                </Card>

                <Card icon={CalendarClock} title="Scheduler">
                    <Row label="Tick interval">every {scheduler.intervalSeconds}s</Row>
                    <Row label="Due now">{scheduler.dueNow}</Row>
                    <Row label="Processing">{scheduler.processing}</Row>
                    <Row label="Failed · last 24h">
                        <span style={scheduler.failedLast24h > 0 ? { color: '#F87171' } : undefined}>
                            {scheduler.failedLast24h}
                        </span>
                    </Row>
                </Card>

                <Card icon={Plug} title="Integrations">
                    {Object.entries({
                        'Meta app': integrations.meta,
                        'LinkedIn app': integrations.linkedin,
                        'Razorpay (storage billing)': integrations.razorpay,
                        'Web push (FCM)': integrations.push,
                        'Bunny storage': integrations.bunny,
                    }).map(([label, ok]) => (
                        <Row key={label} label={label}>
                            <StatusChip status={ok ? 'healthy' : 'disconnected'} label={ok ? 'configured' : 'not configured'} />
                        </Row>
                    ))}
                </Card>
            </div>

            <p className="text-[11px] text-[var(--muted-2)]">
                "Due now" counts pending posts whose scheduled time has passed — a growing number here
                means the scheduler is not keeping up or the server process is down.
            </p>
        </div>
    );
};

export default HealthPanel;
