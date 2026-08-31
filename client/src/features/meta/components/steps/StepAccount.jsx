import React, { useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { platformMeta } from '@/features/meta/lib/providers';

/**
 * Step 1: Account Selection
 *
 * Pick a target — a Facebook Page, a LinkedIn profile, a LinkedIn Page — then
 * which of that target's networks to publish to.
 *
 * Each target arrives carrying its own `platforms` list, so the old
 * "is Instagram disabled?" question disappears: a Page with no linked
 * Instagram Business account simply does not offer instagram, and a LinkedIn
 * target offers only linkedin.
 */
const StepAccount = ({ targets = [], selectedTargetId, platforms = [], onSelect, onPlatformsChange }) => {
    const selectedTarget = targets.find((t) => String(t.id) === String(selectedTargetId));

    // The Publish To block renders below the target list, which on shorter
    // screens is past the modal's fold. Bring it into view on selection so the
    // network choice is never missed.
    const publishToRef = useRef(null);
    useEffect(() => {
        if (selectedTargetId && publishToRef.current) {
            publishToRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedTargetId]);

    const togglePlatform = (platform) => {
        const next = platforms.includes(platform)
            ? platforms.filter((p) => p !== platform)
            : [...platforms, platform];

        // Never allow an empty target — fall back to what this target leads with.
        onPlatformsChange(next.length ? next : [selectedTarget?.platforms?.[0] ?? 'facebook']);
    };

    return (
        <div className="space-y-6">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <Users className="h-5 w-5 text-[var(--accent)]" /> Choose where to post
            </h4>

            <div>
                <label className="block text-xs text-[var(--accent)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-[var(--accent)]"></span>
                    Your connected accounts
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    {targets.map((target) => {
                        const PrimaryIcon = platformMeta(target.platforms[0]).Icon;
                        const isSelected = String(selectedTargetId) === String(target.id);

                        return (
                            <div
                                key={target.id}
                                onClick={() => onSelect(target.id)}
                                className={`p-5 border cursor-pointer transition-all flex flex-col gap-2 rounded-xl group ${isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xl -translate-y-1'
                                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--bg)]'
                                    }`}
                            >
                                <h5 className="font-bold font-['Space_Grotesk'] text-[var(--text)] text-lg tracking-tight group-hover:text-[var(--accent)] transition-colors">
                                    {target.name}
                                </h5>
                                <p className="text-xs text-[var(--muted)] flex items-center gap-1.5">
                                    <PrimaryIcon className="h-3 w-3" />
                                    {target.subtitle}
                                </p>
                                {target.igUsername && (
                                    <p className="text-xs text-[var(--accent)] flex items-center gap-1.5">
                                        {React.createElement(platformMeta('instagram').Icon, { className: 'h-3 w-3' })}
                                        @{target.igUsername}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {targets.length === 0 && (
                    <p className="text-xs text-[var(--muted)] mt-3">
                        No accounts connected yet. Connect one from Social Profiles first.
                    </p>
                )}
            </div>

            {selectedTarget && (
                <div ref={publishToRef}>
                    <label className="block text-xs text-[var(--accent)] mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-[var(--accent)]"></span>
                        Publish To
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        {selectedTarget.platforms.map((id) => {
                            const meta = platformMeta(id);
                            const active = platforms.includes(id);

                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => togglePlatform(id)}
                                    className={`p-5 border transition-all flex items-center gap-3 rounded-xl text-left ${active
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]'
                                        }`}
                                >
                                    <meta.Icon className="h-5 w-5 shrink-0" />
                                    <div>
                                        <div className="text-[13px] font-bold">{meta.label}</div>
                                        <div className="text-xs text-[var(--muted)]">
                                            {id === 'instagram' && selectedTarget.igUsername
                                                ? `@${selectedTarget.igUsername}`
                                                : selectedTarget.name}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {platforms.some((id) => platformMeta(id).requiresMedia) && (
                        <p className="text-xs text-[var(--muted)] mt-4">
                            {platforms.filter((id) => platformMeta(id).requiresMedia).map((id) => platformMeta(id).label).join(' and ')}
                            {' '}requires at least one image or video — text-only posts are not supported.
                        </p>
                    )}

                    {platforms.includes('linkedin') && (
                        <p className="text-xs text-[var(--muted)] mt-2">
                            LinkedIn posts support one image or video, and up to 3,000 characters.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default StepAccount;
