import React, { useEffect, useState } from 'react';
import {
    Send,
    CheckCircle2,
    XCircle,
    Clock,
    Heart,
    MessageCircle,
    Share2,
    Instagram,
    Facebook,
    ExternalLink,
} from 'lucide-react';
import API_BASE_URL from '@/shared/config';
import { platformMeta } from '@/features/meta/lib/providers';

/**
 * Analytics panel.
 *
 * Reports on the posts THIS app published — the same set shown in Post
 * History — rather than everything on the connected accounts. Engagement
 * comes from pages_read_engagement / instagram_basic; there are no ad
 * metrics here, because the app does not request ads permissions.
 */

const Stat = ({ icon: Icon, label, value, tone = 'default' }) => {
    const tones = {
        default: 'text-[var(--text)]',
        good: 'text-[var(--accent)]',
        bad: 'text-red-500',
        muted: 'text-[var(--muted)]',
    };
    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2 mb-3">
                <Icon className="h-4 w-4 text-[var(--muted)]" />
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
        </div>
    );
};

const num = (v) => (v === null || v === undefined ? '—' : v.toLocaleString());

const AnalyticsPanel = ({ posts = [], authHeaders, hasMeta = true, hasLinkedIn = false }) => {
    const [rows, setRows] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // ── Delivery, from our own publishing queue ──
    const published = posts.filter(p => p.status === 'published');
    const failed = posts.filter(p => p.status === 'failed');
    const pending = posts.filter(p => p.status === 'pending' || p.status === 'processing');
    const attempted = published.length + failed.length;
    const successRate = attempted === 0 ? null : Math.round((published.length / attempted) * 100);

    // ── Engagement, per published post ──
    useEffect(() => {
        if (published.length === 0) { setRows([]); return; }
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                // Each provider reads its own posts. Ask only the ones that are
                // actually connected, so a LinkedIn-only user does not get a
                // 404 from the Meta endpoint (and vice versa).
                const sources = [
                    hasMeta && '/api/meta/posts/metrics?limit=20',
                    hasLinkedIn && '/api/linkedin/posts/metrics?limit=20',
                ].filter(Boolean);

                const responses = await Promise.all(sources.map(async (path) => {
                    try {
                        const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
                        return await res.json();
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                }));

                if (cancelled) return;

                const merged = responses.filter((d) => d.success).flatMap((d) => d.posts || []);
                // One provider failing should not blank the whole tab.
                const failure = responses.find((d) => !d.success);

                if (merged.length || !failure) {
                    setRows(merged.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)));
                    setError(null);
                } else {
                    setError(failure.error || 'Could not load post metrics');
                }
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [published.length, hasMeta, hasLinkedIn]);

    // Totals across every platform result we managed to read
    const all = (rows || []).flatMap(r => Object.values(r.metrics || {})).filter(m => !m.unavailable);
    const totalLikes = all.reduce((n, m) => n + (m.likes || 0), 0);
    const totalComments = all.reduce((n, m) => n + (m.comments || 0), 0);
    const totalShares = all.reduce((n, m) => n + (m.shares || 0), 0);
    const avg = all.length ? Math.round((totalLikes + totalComments + totalShares) / all.length) : 0;

    return (
        <div className="space-y-10">
            {/* ── Delivery ── */}
            <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)] mb-1">Delivery</h3>
                <p className="text-sm text-[var(--muted)] mb-4">
                    How your posts have performed at actually getting published.
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Stat icon={Send} label="Published" value={published.length} tone="good" />
                    <Stat icon={XCircle} label="Failed" value={failed.length} tone={failed.length ? 'bad' : 'muted'} />
                    <Stat icon={Clock} label="Upcoming" value={pending.length} />
                    <Stat
                        icon={CheckCircle2}
                        label="Success rate"
                        value={successRate === null ? '—' : `${successRate}%`}
                        tone={successRate === null ? 'muted' : successRate === 100 ? 'good' : 'default'}
                    />
                </div>
            </div>

            {/* ── Engagement ── */}
            <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)] mb-1">Engagement</h3>
                <p className="text-sm text-[var(--muted)] mb-4">
                    Totals across the posts you published here — the same posts listed in Post History.
                </p>

                {published.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                        Nothing published yet. Once a post goes out, its likes and comments appear here.
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-600">{error}</div>
                ) : loading || rows === null ? (
                    <div className="rounded-2xl border border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                        Loading engagement…
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <Stat icon={Heart} label="Likes" value={num(totalLikes)} />
                            <Stat icon={MessageCircle} label="Comments" value={num(totalComments)} />
                            <Stat icon={Share2} label="Shares" value={num(totalShares)} />
                            <Stat icon={CheckCircle2} label="Avg per post" value={num(avg)} />
                        </div>

                        {/* Per-post breakdown */}
                        <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse min-w-[640px]">
                                    <thead>
                                        <tr className="bg-[var(--surface)]">
                                            <th className="text-left py-3 px-5 text-xs font-normal text-[var(--muted)]">Post</th>
                                            <th className="text-left py-3 px-3 text-xs font-normal text-[var(--muted)] w-28">Where</th>
                                            <th className="py-3 px-3 text-xs font-normal text-[var(--muted)] w-20">Likes</th>
                                            <th className="py-3 px-3 text-xs font-normal text-[var(--muted)] w-24">Comments</th>
                                            <th className="py-3 px-3 text-xs font-normal text-[var(--muted)] w-20">Shares</th>
                                            <th className="py-3 px-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.flatMap((post, i) =>
                                            Object.entries(post.metrics || {}).map(([platform, m], j) => {
                                                const Icon = platformMeta(platform).Icon;
                                                return (
                                                    <tr key={`${post.id}-${platform}`}
                                                        className={(i + j) > 0 ? 'border-t border-[var(--border)]' : ''}>
                                                        <td className="py-3 px-5">
                                                            <div className="flex items-center gap-3">
                                                                {(m.thumbnail || post.mediaUrl) && (
                                                                    <img src={m.thumbnail || post.mediaUrl} alt=""
                                                                        className="w-9 h-9 rounded-lg object-cover shrink-0" />
                                                                )}
                                                                <span className="line-clamp-1 text-[var(--text)] max-w-xs">
                                                                    {post.content || '—'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-3">
                                                            <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                                                                <Icon className="h-3.5 w-3.5" />
                                                                {platformMeta(platform).label}
                                                            </span>
                                                        </td>
                                                        {m.unavailable ? (
                                                            <td colSpan={3} className="py-3 px-3 text-center text-xs text-[var(--muted-2)]"
                                                                title={m.error}>
                                                                unavailable
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td className="py-3 px-3 text-center text-[var(--text)]">{num(m.likes)}</td>
                                                                <td className="py-3 px-3 text-center text-[var(--text)]">{num(m.comments)}</td>
                                                                <td className="py-3 px-3 text-center text-[var(--text)]">{num(m.shares)}</td>
                                                            </>
                                                        )}
                                                        <td className="py-3 px-3 text-center">
                                                            {m.permalink && (
                                                                <a href={m.permalink} target="_blank" rel="noopener noreferrer"
                                                                    className="text-[var(--muted)] hover:text-[var(--accent)]"
                                                                    title="Open on the platform">
                                                                    <ExternalLink className="h-3.5 w-3.5 inline" />
                                                                </a>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <p className="text-xs text-[var(--muted-2)] mt-4 leading-relaxed">
                            Counts come from Meta at the moment this page loaded. A post deleted on
                            the platform shows as unavailable. Ad metrics — impressions, reach and
                            spend — are not shown, because this app does not request ads permissions.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default AnalyticsPanel;
