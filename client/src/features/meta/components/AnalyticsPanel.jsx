import React, { useEffect, useState, useMemo } from 'react';
import {
    Send,
    CheckCircle2,
    XCircle,
    Clock,
    Heart,
    MessageCircle,
    Share2,
    RefreshCw,
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart, Line,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import API_BASE_URL from '@/shared/config';
import { platformMeta } from '@/features/meta/lib/providers';

/**
 * Analytics panel.
 *
 * Engagement is read LIVE from Meta — every published post on the connected
 * Pages and Instagram accounts, whether or not it went out through this app
 * (the same source as Post History). LinkedIn is the exception: its API only
 * exposes posts this app published, so those rows are app-tracked. No ad
 * metrics — the app does not request ads permissions.
 */

// Chart series colors — literal hex, validated for CVD separation and
// contrast against both app surfaces (#111111 dark / #F5F5F5 light).
const SERIES = {
    likes: { label: 'Likes', color: '#0F9494' },
    comments: { label: 'Comments', color: '#7C5CE8' },
};

const Stat = ({ icon, label, value, tone = 'default' }) => {
    const Icon = icon;
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

/** Shared legend: a colored mark carries identity; the text wears text tokens. */
const ChartLegend = () => (
    <div className="flex items-center gap-4 mb-2">
        {Object.values(SERIES).map(({ label, color }) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                {label}
            </span>
        ))}
    </div>
);

/** Tooltip as an HTML overlay, so it can wear the app's theme tokens. */
const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-lg">
            <p className="text-[11px] font-mono text-[var(--muted)] mb-1">{label}</p>
            {payload.map((entry) => (
                <p key={entry.dataKey} className="flex items-center gap-1.5 text-[12px] text-[var(--text)]">
                    <span className="w-2 h-2 rounded-sm" style={{ background: entry.color || entry.fill }} />
                    {SERIES[entry.dataKey]?.label || entry.dataKey}: {num(entry.value)}
                </p>
            ))}
        </div>
    );
};

const axisTick = { fill: '#777777', fontSize: 11 };
const gridStroke = { stroke: '#777777', strokeOpacity: 0.15 };

const AnalyticsPanel = ({ posts = [], authHeaders, hasMeta = true, hasLinkedIn = false }) => {
    const [liveRows, setLiveRows] = useState(null);      // live FB/IG posts
    const [feedErrors, setFeedErrors] = useState([]);    // per-feed read failures
    const [linkedinRows, setLinkedinRows] = useState([]); // app-tracked LinkedIn
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    // ── Delivery (the app's own queue) ──
    const published = posts.filter(p => p.status === 'published');
    const failed = posts.filter(p => p.status === 'failed');
    const pending = posts.filter(p => p.status === 'pending' || p.status === 'processing');
    const attempted = published.length + failed.length;
    const successRate = attempted === 0 ? null : Math.round((published.length / attempted) * 100);

    // ── Engagement: live platform data, same source as Post History ──
    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [metaRes, liRes] = await Promise.all([
                    hasMeta
                        ? fetch(`${API_BASE_URL}/api/meta/posts/history?limit=50`, { headers: authHeaders() })
                            .then((r) => r.json()).catch((e) => ({ success: false, error: e.message }))
                        : Promise.resolve({ success: true, posts: [] }),
                    hasLinkedIn
                        ? fetch(`${API_BASE_URL}/api/linkedin/posts/metrics?limit=20`, { headers: authHeaders() })
                            .then((r) => r.json()).catch(() => ({ success: false }))
                        : Promise.resolve({ success: true, posts: [] }),
                ]);
                if (cancelled) return;

                if (metaRes.success) {
                    setLiveRows(metaRes.posts || []);
                    setFeedErrors(metaRes.feedErrors || []);
                } else {
                    setLiveRows([]);
                    setError(metaRes.error || 'Could not load engagement from Meta');
                }

                // LinkedIn metrics rows carry per-platform metrics; flatten to
                // the live-row shape so one table renders both.
                if (liRes.success) {
                    setLinkedinRows((liRes.posts || []).flatMap((post) =>
                        Object.entries(post.metrics || {})
                            .filter(([, m]) => !m.unavailable)
                            .map(([platform, m]) => ({
                                id: `${post.id}-${platform}`,
                                platform,
                                pageName: post.pageName || 'LinkedIn',
                                message: post.content || '',
                                mediaUrl: m.thumbnail || post.mediaUrl || null,
                                permalink: m.permalink || null,
                                publishedAt: post.publishedAt,
                                likes: m.likes ?? null,
                                comments: m.comments ?? null,
                                shares: m.shares ?? null,
                            })),
                    ));
                }
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [hasMeta, hasLinkedIn, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const allRows = useMemo(
        () => [...(liveRows || []), ...linkedinRows]
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
        [liveRows, linkedinRows],
    );

    const totalLikes = allRows.reduce((n, r) => n + (r.likes || 0), 0);
    const totalComments = allRows.reduce((n, r) => n + (r.comments || 0), 0);
    const totalShares = allRows.reduce((n, r) => n + (r.shares || 0), 0);
    const avg = allRows.length ? Math.round((totalLikes + totalComments + totalShares) / allRows.length) : 0;

    // Per-day engagement, oldest → newest, for the time chart.
    const daily = useMemo(() => {
        const byDay = new Map();
        for (const row of allRows) {
            if (!row.publishedAt) continue;
            const d = new Date(row.publishedAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const bucket = byDay.get(key) || {
                key,
                day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                likes: 0,
                comments: 0,
            };
            bucket.likes += row.likes || 0;
            bucket.comments += row.comments || 0;
            byDay.set(key, bucket);
        }
        return [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    }, [allRows]);

    // Totals per platform, for the comparison chart.
    const byPlatform = useMemo(() => {
        const map = new Map();
        for (const row of allRows) {
            const label = platformMeta(row.platform).label;
            const bucket = map.get(label) || { platform: label, likes: 0, comments: 0 };
            bucket.likes += row.likes || 0;
            bucket.comments += row.comments || 0;
            map.set(label, bucket);
        }
        return [...map.values()];
    }, [allRows]);

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
                <div className="flex items-center gap-3 mb-1">
                    <h3 className="flex-1 font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">Engagement</h3>
                    <button
                        onClick={() => setReloadKey((k) => k + 1)}
                        disabled={loading}
                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors disabled:opacity-60"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <p className="text-sm text-[var(--muted)] mb-4">
                    Live from your connected accounts — every post on your Pages and Instagram,
                    posted through Botlance or natively.
                </p>

                {feedErrors.length > 0 && (
                    <div className="rounded-xl border px-4 py-3 mb-4 text-[12px] leading-relaxed"
                        style={{ borderColor: 'rgba(251, 191, 36, 0.4)', background: 'rgba(251, 191, 36, 0.08)' }}>
                        <p className="font-medium text-[var(--text)] mb-0.5">Some feeds could not be read:</p>
                        {feedErrors.map((msg, i) => (
                            <p key={i} className="text-[var(--muted)] break-words">{msg}</p>
                        ))}
                    </div>
                )}

                {error ? (
                    <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-sm text-red-600">{error}</div>
                ) : loading && liveRows === null ? (
                    <div className="rounded-2xl border border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                        Loading engagement…
                    </div>
                ) : allRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                        No posts found on your connected accounts yet.
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <Stat icon={Heart} label="Likes" value={num(totalLikes)} />
                            <Stat icon={MessageCircle} label="Comments" value={num(totalComments)} />
                            <Stat icon={Share2} label="Shares" value={num(totalShares)} />
                            <Stat icon={CheckCircle2} label="Avg per post" value={num(avg)} />
                        </div>

                        {/* ── Charts ── */}
                        {daily.length >= 2 && (
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
                                <h4 className="text-sm font-semibold text-[var(--text)] mb-1">Engagement over time</h4>
                                <p className="text-xs text-[var(--muted)] mb-3">Likes and comments received by posts published each day.</p>
                                <ChartLegend />
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                                        <CartesianGrid vertical={false} {...gridStroke} />
                                        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                                        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#777777', strokeOpacity: 0.3 }} />
                                        <Line type="monotone" dataKey="likes" stroke={SERIES.likes.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                        <Line type="monotone" dataKey="comments" stroke={SERIES.comments.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {byPlatform.length >= 2 && (
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
                                <h4 className="text-sm font-semibold text-[var(--text)] mb-1">By platform</h4>
                                <p className="text-xs text-[var(--muted)] mb-3">Total engagement per network across the fetched posts.</p>
                                <ChartLegend />
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={byPlatform} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2}>
                                        <CartesianGrid vertical={false} {...gridStroke} />
                                        <XAxis dataKey="platform" tick={axisTick} axisLine={false} tickLine={false} />
                                        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#777777', fillOpacity: 0.08 }} />
                                        <Bar dataKey="likes" fill={SERIES.likes.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
                                        <Bar dataKey="comments" fill={SERIES.comments.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        <p className="text-xs text-[var(--muted-2)] mt-4 leading-relaxed">
                            Facebook and Instagram counts come live from Meta and include posts made
                            natively on the platforms — the per-post breakdown lives in Post History.
                            LinkedIn shows only posts published through Botlance, since its API does
                            not expose a member's full history. Ad metrics are not shown, because
                            this app does not request ads permissions.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default AnalyticsPanel;
