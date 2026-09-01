import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminSidebar from '../components/AdminSidebar';
import OverviewPanel from '../components/OverviewPanel';
import UsersPanel from '../components/UsersPanel';
import ConnectionsPanel from '../components/ConnectionsPanel';
import StoragePanel from '../components/StoragePanel';
import { fetchOverview } from '../lib/adminApi';

const TITLES = {
    overview: ['Overview', 'Everything running across the platform right now'],
    users: ['Users', 'Every account on the platform'],
    connections: ['Connections', 'Every linked Meta and LinkedIn account, with token health'],
    storage: ['Storage', 'Media storage pricing, retention, and purchases'],
};

/**
 * Platform admin panel. Access is decided server-side (users.role='admin');
 * a 403 from the first overview call renders the access-denied screen, so
 * nothing sensitive ever reaches a non-admin client.
 */
const AdminPanelPage = () => {
    const [tab, setTab] = useState('overview');
    const [overview, setOverview] = useState(null);
    const [denied, setDenied] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadOverview = useCallback(async () => {
        setLoading(true);
        try {
            setOverview(await fetchOverview());
            setDenied(false);
        } catch (err) {
            if (err.status === 403) {
                setDenied(true);
            } else {
                toast.error(err.message || 'Could not load the admin panel');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    if (denied) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg)] text-[var(--text)] px-6">
                <ShieldOff className="h-10 w-10 text-[var(--muted)]" />
                <h1 className="text-xl font-bold">Admin access required</h1>
                <p className="text-sm text-[var(--muted)] text-center max-w-sm">
                    This area is limited to platform administrators. If you think you should have
                    access, ask an existing admin to grant your account the admin role.
                </p>
                <Link
                    to="/socialdashboad"
                    className="btn-primary rounded-xl px-5 py-2.5 text-sm"
                >
                    Back to dashboard
                </Link>
            </div>
        );
    }

    const [title, subtitle] = TITLES[tab];
    const counts = overview
        ? {
            users: overview.stats.totalUsers,
            connections: overview.stats.metaConnections + overview.stats.linkedinConnections,
        }
        : {};

    return (
        <div className="min-h-screen flex bg-[var(--bg)] text-[var(--text)]">
            <AdminSidebar active={tab} onNavigate={setTab} counts={counts} />

            <main className="flex-1 min-w-0 px-5 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
                        <p className="text-[13px] text-[var(--muted)]">{subtitle}</p>
                    </div>
                    {tab === 'overview' && (
                        <button
                            onClick={loadOverview}
                            className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>

                {tab === 'overview' && (
                    loading && !overview ? (
                        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
                            Loading overview…
                        </div>
                    ) : overview && (
                        <OverviewPanel data={overview} onOpenConnections={() => setTab('connections')} />
                    )
                )}
                {tab === 'users' && <UsersPanel />}
                {tab === 'connections' && <ConnectionsPanel />}
                {tab === 'storage' && <StoragePanel />}
            </main>
        </div>
    );
};

export default AdminPanelPage;
