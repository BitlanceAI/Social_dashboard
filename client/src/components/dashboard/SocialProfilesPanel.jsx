import React from 'react';
import { Facebook, Instagram, RefreshCw, Plus, Info, Unlink } from 'lucide-react';

/**
 * Social Profiles tab.
 *
 * Disconnected: asks which profile the user wants to connect.
 * Connected: lists the Facebook Pages and Instagram Business accounts found.
 *
 * Both choices start the SAME Meta OAuth flow — Meta has no standalone
 * Instagram login, and an Instagram Business account is only reachable through
 * the Facebook Page it is linked to. The Instagram card says so explicitly
 * rather than implying two separate integrations.
 */

const CHOICES = [
    {
        id: 'facebook',
        icon: Facebook,
        title: 'Facebook Page',
        body: 'Publish posts, photos, video and carousels to a Page you manage.',
        note: null,
    },
    {
        id: 'instagram',
        icon: Instagram,
        title: 'Instagram Business',
        body: 'Publish photos, Reels and carousels to an Instagram Business or Creator account.',
        note: 'Connects through the Facebook Page your Instagram account is linked to.',
    },
];

const SocialProfilesPanel = ({ loading, isConnected, pages = [], onConnect, onManagePages, onRefresh, onDisconnect, refreshing }) => {
    const igAccounts = pages
        .filter(p => p.instagram_business_account?.id)
        .map(p => ({ ...p.instagram_business_account, pageName: p.name }));

    // Hold the frame while the connection check is in flight, so the
    // "connect a profile" prompt cannot flash at an already-connected user.
    if (loading) return null;

    // ── Not connected: which profile do you want to add? ──
    if (!isConnected) {
        return (
            <div>
                <div className="text-center mb-10">
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)] mb-2">
                        Connect a Social Profile
                    </h2>
                    <p className="text-sm text-[var(--muted)]">
                        Which profile do you want to publish to?
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
                    {CHOICES.map(({ id, icon: Icon, title, body, note }) => (
                        <button
                            key={id}
                            onClick={() => onConnect(id)}
                            className="text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md hover:-translate-y-0.5"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center mb-4">
                                <Icon className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight text-[var(--text)] mb-1.5">
                                {title}
                            </h3>
                            <p className="text-sm text-[var(--muted)] leading-relaxed">{body}</p>
                            {note && (
                                <p className="mt-3 flex gap-2 text-[12px] text-[var(--muted-2)] leading-relaxed">
                                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    {note}
                                </p>
                            )}
                        </button>
                    ))}
                </div>

                <p className="mt-8 text-center text-[12px] text-[var(--muted-2)] max-w-lg mx-auto leading-relaxed">
                    Either option signs you in with Facebook. We never see your password, and you
                    can disconnect at any time.
                </p>
            </div>
        );
    }

    // ── Connected: what we found ──
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="font-['Space_Grotesk'] text-xl font-bold tracking-tight text-[var(--text)]">
                    Connected Profiles
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRefresh}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={onDisconnect}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-red-400 hover:text-red-500 transition-colors"
                    >
                        <Unlink className="h-3.5 w-3.5" />
                        Disconnect
                    </button>
                </div>
            </div>

            {/* Facebook Pages */}
            <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3 flex items-center gap-2">
                    <Facebook className="h-3.5 w-3.5" />
                    Facebook Pages ({pages.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pages.map(page => (
                        <div
                            key={page.id}
                            className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
                        >
                            {page.picture?.data?.url ? (
                                <img src={page.picture.data.url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                            ) : (
                                <div className="w-11 h-11 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
                                    <Facebook className="h-5 w-5 text-[var(--accent)]" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="font-medium text-[var(--text)] truncate">{page.name}</p>
                                <p className="text-sm text-[var(--muted)] truncate">{page.category || 'Page'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Instagram accounts */}
            <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3 flex items-center gap-2">
                    <Instagram className="h-3.5 w-3.5" />
                    Instagram Accounts ({igAccounts.length})
                </p>

                {igAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)] leading-relaxed">
                        No Instagram Business account is linked to any of your Pages. Link one in
                        Meta Business Suite, then hit Refresh — it will appear here and become
                        selectable in the composer.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {igAccounts.map(acc => (
                            <div
                                key={acc.id}
                                className="flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
                            >
                                {acc.profile_picture_url ? (
                                    <img src={acc.profile_picture_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                                ) : (
                                    <div className="w-11 h-11 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
                                        <Instagram className="h-5 w-5 text-[var(--accent)]" />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="font-medium text-[var(--text)] truncate">
                                        @{acc.username || acc.id}
                                    </p>
                                    <p className="text-sm text-[var(--muted)] truncate">via {acc.pageName}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={onManagePages}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Choose which profiles to use
                </button>
                <button
                    onClick={() => onConnect('facebook')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Connect another account
                </button>
            </div>
        </div>
    );
};

export default SocialProfilesPanel;
