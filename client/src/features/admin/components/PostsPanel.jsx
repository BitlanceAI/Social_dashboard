import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchPosts } from '../lib/adminApi';
import StatusChip from './StatusChip';

const PER_PAGE = 20;
const STATUSES = ['', 'pending', 'processing', 'published', 'failed', 'cancelled'];

const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Scheduled Posts tab: the platform-wide queue across every user. */
const PostsPanel = () => {
    const [posts, setPosts] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (nextPage, nextStatus) => {
        setLoading(true);
        try {
            const res = await fetchPosts({ page: nextPage, per: PER_PAGE, status: nextStatus });
            setPosts(res.posts);
            setTotal(res.total);
        } catch (err) {
            toast.error(err.message || 'Could not load posts');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => load(page, status), 0);
        return () => clearTimeout(t);
    }, [page, status, load]);

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    return (
        <div className="space-y-4">
            {/* Status filter */}
            <div className="flex flex-wrap items-center gap-2">
                {STATUSES.map((s) => (
                    <button
                        key={s || 'all'}
                        onClick={() => { setPage(1); setStatus(s); }}
                        className={`text-[11px] font-mono px-3 py-1.5 rounded-full transition-colors ${
                            status === s
                                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                : 'border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                    >
                        {s || 'All'}
                    </button>
                ))}
                <div className="flex-1" />
                <button
                    onClick={() => load(page, status)}
                    className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Content', 'Target', 'Provider', 'Scheduled for', 'Status'].map((h) => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {posts.map((p) => (
                                <tr key={p.id} className="border-t border-[var(--border)]" title={p.error_message || undefined}>
                                    <td className="px-5 py-3.5">
                                        <span className="block text-sm font-medium truncate max-w-[160px]">{p.userName}</span>
                                        {p.userEmail && <span className="block text-[11px] text-[var(--muted)] truncate max-w-[160px]">{p.userEmail}</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-sm text-[var(--muted)] max-w-[240px]">
                                        <span className="block truncate">{p.content || '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5 text-sm text-[var(--muted)] whitespace-nowrap">{p.page_name || '—'}</td>
                                    <td className="px-5 py-3.5"><StatusChip status="disconnected" label={p.provider} /></td>
                                    <td className="px-5 py-3.5 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDateTime(p.scheduled_time)}</td>
                                    <td className="px-5 py-3.5"><StatusChip status={p.status} /></td>
                                </tr>
                            ))}
                            {!loading && posts.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No posts{status ? ` with status “${status}”` : ''}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center px-5 py-3 border-t border-[var(--border)]">
                    <span className="flex-1 text-[11px] font-mono text-[var(--muted)]">
                        {total} post{total === 1 ? '' : 's'}{status ? ` · ${status}` : ''}
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

            <p className="text-[11px] text-[var(--muted-2)]">
                Hover a failed row to see the error the platform returned.
            </p>
        </div>
    );
};

export default PostsPanel;
