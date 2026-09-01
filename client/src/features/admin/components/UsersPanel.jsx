import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchUsers } from '../lib/adminApi';
import StatusChip from './StatusChip';
import AddUserModal from './AddUserModal';

const PER_PAGE = 20;

const fmtMonth = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

/**
 * Users tab: paginated, searchable list with connection presence and
 * token-health status per user. Owns its own data (search + paging state
 * would otherwise leak into the page).
 */
const UsersPanel = () => {
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showAddUser, setShowAddUser] = useState(false);

    const load = useCallback(async (nextPage, nextSearch) => {
        setLoading(true);
        try {
            const res = await fetchUsers({ page: nextPage, per: PER_PAGE, search: nextSearch });
            setUsers(res.users);
            setTotal(res.total);
        } catch (err) {
            toast.error(err.message || 'Could not load users');
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce the search box so we do not query per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => load(page, search), search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [page, search, load]);

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
    const to = Math.min(total, page * PER_PAGE);

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] w-72">
                    <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                    <input
                        value={search}
                        onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                        placeholder="Search by name or email…"
                        className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                    />
                </div>
                <button
                    onClick={() => load(page, search)}
                    className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <div className="flex-1" />
                <button
                    onClick={() => setShowAddUser(true)}
                    className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
                >
                    <UserPlus className="h-4 w-4" />
                    Add user
                </button>
            </div>

            {showAddUser && (
                <AddUserModal
                    onClose={() => setShowAddUser(false)}
                    onCreated={() => {
                        setShowAddUser(false);
                        setPage(1);
                        load(1, search);
                    }}
                />
            )}

            {/* Table */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Connections', 'Posts', 'Joined', 'Status'].map((h) => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3.5">
                                        <span className="flex items-center gap-3">
                                            <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--muted)] text-[13px] font-semibold flex items-center justify-center shrink-0">
                                                {(u.name?.[0] || u.email?.[0] || '?').toUpperCase()}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium truncate">
                                                    {u.name || '—'}
                                                    {u.role === 'admin' && (
                                                        <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-[var(--accent)]">admin</span>
                                                    )}
                                                </span>
                                                <span className="block text-[11px] text-[var(--muted)] truncate">{u.email}</span>
                                            </span>
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {u.providers.length === 0 ? (
                                            <span className="text-xs text-[var(--muted-2)]">—</span>
                                        ) : (
                                            <span className="flex gap-1.5">
                                                {u.providers.map((p) => (
                                                    <StatusChip key={p} status="disconnected" label={p} />
                                                ))}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)]">{u.postCount}</td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtMonth(u.createdAt)}</td>
                                    <td className="px-5 py-3.5"><StatusChip status={u.status} /></td>
                                </tr>
                            ))}
                            {!loading && users.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No users match{search ? ` “${search}”` : ''}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center px-5 py-3 border-t border-[var(--border)]">
                    <span className="flex-1 text-[11px] font-mono text-[var(--muted)]">
                        Showing {from}–{to} of {total}
                    </span>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] disabled:text-[var(--muted-2)] disabled:cursor-not-allowed hover:bg-[var(--surface-2)] transition-colors"
                        >
                            Prev
                        </button>
                        <span className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] disabled:text-[var(--muted-2)] disabled:cursor-not-allowed hover:bg-[var(--surface-2)] transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UsersPanel;
