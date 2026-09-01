import React from 'react';
import { RefreshCw, Plus, LogOut, AlertTriangle, Settings2 } from 'lucide-react';
import { platformMeta } from '@/features/meta/lib/providers';

/**
 * Social Profiles tab.
 *
 * One row per connected account, each with its own disconnect control. The
 * network picker lives in AddProfileModal rather than inline, so this view
 * stays a list of what you have rather than a list of what you could add.
 */

const initialOf = (name = '') => (name.trim()[0] || '?').toUpperCase();

const SocialProfilesPanel = ({
    loading,
    isConnected,
    targets = [],
    metaScopes = null,
    instagramAccounts = [],
    hiddenInstagram = [],
    linkedinConnection,
    postCounts = {},
    onAddProfile,
    onManagePages,
    onRefresh,
    onRemoveTarget,
    refreshing,
}) => {
    // Hold the frame while the connection check is in flight, so the empty
    // state cannot flash at an already-connected user.
    if (loading) return null;

    const expiry = linkedinConnection?.needsReconnect ? linkedinConnection : null;

    // Permissions the app asks for that Meta says this token does NOT carry.
    // This is why "History shows nothing" and similar failures happen, so it
    // must be visible here, not just in server logs.
    const missingScopes = metaScopes
        ? metaScopes.required.filter((s) => !metaScopes.granted.includes(s))
        : [];

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="font-['Space_Grotesk'] text-2xl font-extrabold tracking-tight text-[var(--text)]">
                        Social Profiles
                    </h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-1.5">
                        Manage your connected social accounts
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {isConnected && (
                        <button
                            onClick={onRefresh}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    )}
                    <button
                        onClick={onAddProfile}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--accent)] text-white text-xs font-bold font-mono uppercase tracking-widest hover:opacity-90 transition-opacity"
                    >
                        <Plus className="h-4 w-4" />
                        Add Profile
                    </button>
                </div>
            </div>

            {/* LinkedIn tokens last 60 days and this app cannot refresh them,
                so an expiring connection has to be visible, not just logged. */}
            {expiry && (
                <div className={`flex items-start gap-3 rounded-2xl border p-4 ${expiry.expired
                    ? 'border-red-400/60 bg-red-500/10'
                    : 'border-amber-400/60 bg-amber-500/10'
                    }`}>
                    <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${expiry.expired ? 'text-red-500' : 'text-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text)]">
                            {expiry.expired
                                ? 'Your LinkedIn connection has expired'
                                : `Your LinkedIn connection expires in ${expiry.daysUntilExpiry} day${expiry.daysUntilExpiry === 1 ? '' : 's'}`}
                        </p>
                        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
                            LinkedIn access lasts 60 days and cannot be renewed automatically.
                            Reconnect to keep scheduled posts publishing.
                        </p>
                    </div>
                    <button
                        onClick={onAddProfile}
                        className="shrink-0 px-4 py-2 rounded-full border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                        Reconnect
                    </button>
                </div>
            )}

            {/* The token's grants decide what works; missing ones must be
                visible with the remedy attached. */}
            {missingScopes.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text)]">
                            Your Facebook connection is missing {missingScopes.length} permission{missingScopes.length === 1 ? '' : 's'}
                        </p>
                        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
                            Features that depend on them (post history, analytics, comments) will fail
                            until you reconnect and approve everything in Facebook's dialog:
                            {' '}<span className="font-mono">{missingScopes.join(', ')}</span>
                        </p>
                    </div>
                    <button
                        onClick={onAddProfile}
                        className="shrink-0 px-4 py-2 rounded-full border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                        Reconnect
                    </button>
                </div>
            )}

            {/* An Instagram account whose Facebook Page is not enabled here can
                never be published to — the app targets IG through its Page. Say
                so, with the fix one click away. */}
            {hiddenInstagram.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text)]">
                            {hiddenInstagram.length} Instagram account{hiddenInstagram.length === 1 ? '' : 's'} not enabled
                        </p>
                        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
                            {hiddenInstagram.map((ig) => `@${ig.username || 'account'} (via ${ig.pageName})`).join(', ')}
                            {' — '}enable {hiddenInstagram.length === 1 ? 'its' : 'their'} Facebook Page below to publish to {hiddenInstagram.length === 1 ? 'it' : 'them'}.
                        </p>
                    </div>
                    <button
                        onClick={onManagePages}
                        className="shrink-0 px-4 py-2 rounded-full border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                        Choose Pages
                    </button>
                </div>
            )}

            {/* ── Empty state ── */}
            {targets.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--border)] p-12 text-center">
                    <p className="font-['Space_Grotesk'] text-base font-bold text-[var(--text)] mb-2">
                        No profiles connected yet
                    </p>
                    <p className="text-sm text-[var(--muted)] mb-6 max-w-sm mx-auto leading-relaxed">
                        Connect a Facebook Page, an Instagram Business account or LinkedIn to
                        start publishing.
                    </p>
                    <button
                        onClick={onAddProfile}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--accent)] text-white text-xs font-bold font-mono uppercase tracking-widest hover:opacity-90 transition-opacity"
                    >
                        <Plus className="h-4 w-4" />
                        Add Profile
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {targets.map((target) => {
                        const primary = platformMeta(target.platforms[0]);
                        const count = postCounts[target.id] ?? 0;

                        return (
                            <div
                                key={`${target.provider}-${target.id}`}
                                className="flex items-center gap-4 p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)]"
                            >
                                {/* Avatar with a platform badge */}
                                <div className="relative shrink-0">
                                    {target.avatarUrl ? (
                                        <img
                                            src={target.avatarUrl}
                                            alt=""
                                            className="w-14 h-14 rounded-2xl object-cover border border-[var(--border)]"
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
                                            <span className="font-['Space_Grotesk'] text-xl font-extrabold text-[var(--muted)]">
                                                {initialOf(target.name)}
                                            </span>
                                        </div>
                                    )}
                                    <span
                                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[var(--surface)]"
                                        style={{ backgroundColor: primary.brand }}
                                    >
                                        <primary.Icon className="h-3 w-3 text-white" />
                                    </span>
                                </div>

                                {/* Identity */}
                                <div className="min-w-0 flex-1">
                                    <p className="font-['Space_Grotesk'] text-base font-extrabold tracking-tight text-[var(--text)] truncate">
                                        {target.name}
                                    </p>
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-0.5">
                                        {target.subtitle}
                                    </p>

                                    <div className="flex items-center gap-3 mt-2">
                                        {/* One chip per network this profile can publish to */}
                                        {target.platforms.map((id) => {
                                            const meta = platformMeta(id);
                                            return (
                                                <span
                                                    key={id}
                                                    title={`${meta.label} — ${count} post${count === 1 ? '' : 's'}`}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] text-[11px] text-[var(--muted)]"
                                                >
                                                    <meta.Icon className="h-3 w-3" />
                                                    {count}
                                                </span>
                                            );
                                        })}

                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                                            Active
                                        </span>
                                    </div>
                                </div>

                                {/* Per-profile disconnect */}
                                <button
                                    onClick={() => onRemoveTarget(target)}
                                    title={target.provider === 'linkedin'
                                        ? 'Disconnect LinkedIn'
                                        : 'Remove this Page'}
                                    className="shrink-0 p-3 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:border-red-400 hover:text-red-500 transition-colors"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </div>
                        );
                    })}

                    {/* Linked Instagram Business accounts, one visible card
                        each. They ride on a Page's connection, so there is no
                        per-card disconnect — unlinking happens on Facebook. */}
                    {instagramAccounts.map((ig) => {
                        const igMeta = platformMeta('instagram');
                        return (
                            <div
                                key={`ig-${ig.id}`}
                                className="flex items-center gap-4 p-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)]"
                            >
                                <div className="relative shrink-0">
                                    {ig.profile_picture_url ? (
                                        <img
                                            src={ig.profile_picture_url}
                                            alt=""
                                            className="w-14 h-14 rounded-2xl object-cover border border-[var(--border)]"
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center">
                                            <span className="font-['Space_Grotesk'] text-xl font-extrabold text-[var(--muted)]">
                                                {initialOf(ig.username)}
                                            </span>
                                        </div>
                                    )}
                                    <span
                                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[var(--surface)]"
                                        style={{ backgroundColor: igMeta.brand }}
                                    >
                                        <igMeta.Icon className="h-3 w-3 text-white" />
                                    </span>
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="font-['Space_Grotesk'] text-base font-extrabold tracking-tight text-[var(--text)] truncate">
                                        @{ig.username || 'instagram'}
                                    </p>
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-0.5">
                                        Instagram Business · via {ig.pageName}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2">
                                        {typeof ig.followers_count === 'number' && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] text-[11px] text-[var(--muted)]">
                                                {ig.followers_count.toLocaleString()} followers
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)]">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                                            Active
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {targets.length > 0 && (
                <button
                    onClick={onManagePages}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                    <Settings2 className="h-3.5 w-3.5" />
                    Choose which Facebook Pages to use
                </button>
            )}
        </div>
    );
};

export default SocialProfilesPanel;
