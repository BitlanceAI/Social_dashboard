import React, { useEffect, useRef } from 'react';
import { Users, Facebook, Instagram } from 'lucide-react';

/**
 * Step 1: Account Selection
 * Pick the Facebook Page, then which Meta surfaces to publish to.
 * Instagram is only offered for Pages that have a linked Instagram
 * Business account (Meta exposes it as page.instagram_business_account).
 */
const StepAccount = ({ pages, selectedPageId, platforms = ['facebook'], onSelect, onPlatformsChange }) => {
    const selectedPage = pages?.find(p => String(p.id) === String(selectedPageId));
    const igAccount = selectedPage?.instagram_business_account;

    // The Publish To block renders below the page list, which on shorter
    // screens is past the modal's fold. Bring it into view on selection so the
    // Facebook / Instagram choice is never missed.
    const publishToRef = useRef(null);
    useEffect(() => {
        if (selectedPageId && publishToRef.current) {
            publishToRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedPageId]);

    const togglePlatform = (platform) => {
        const next = platforms.includes(platform)
            ? platforms.filter(p => p !== platform)
            : [...platforms, platform];
        // Never allow an empty target — fall back to Facebook
        onPlatformsChange(next.length ? next : ['facebook']);
    };

    return (
        <div className="space-y-6">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <Users className="h-5 w-5 text-[var(--accent)]" /> Choose where to post
            </h4>
            <div>
                <label className="block text-xs text-[var(--accent)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-[var(--accent)]"></span>
                    Your Facebook Pages
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    {pages?.map(page => (
                        <div
                            key={page.id}
                            onClick={() => onSelect(page.id)}
                            className={`p-5 border cursor-pointer transition-all flex flex-col gap-2 rounded-xl group ${selectedPageId === page.id
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xl -translate-y-1'
                                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--bg)]'
                                }`}
                        >
                            <h5 className="font-bold font-['Space_Grotesk'] text-[var(--text)] text-lg tracking-tight group-hover:text-[var(--accent)] transition-colors">
                                {page.name}
                            </h5>
                            <p className="text-xs text-[var(--muted)] flex items-center gap-1.5">
                                <Facebook className="h-3 w-3" />
                                Facebook Page{page.category ? ` · ${page.category}` : ''}
                            </p>
                            {page.instagram_business_account?.username && (
                                <p className="text-xs text-[var(--accent)] flex items-center gap-1.5">
                                    <Instagram className="h-3 w-3" />
                                    @{page.instagram_business_account.username}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {selectedPage && (
                <div ref={publishToRef}>
                    <label className="block text-xs text-[var(--accent)] mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-[var(--accent)]"></span>
                        Publish To
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <button
                            type="button"
                            onClick={() => togglePlatform('facebook')}
                            className={`p-5 border transition-all flex items-center gap-3 rounded-xl text-left ${platforms.includes('facebook')
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]'
                                }`}
                        >
                            <Facebook className="h-5 w-5 shrink-0" />
                            <div>
                                <div className="text-[13px] font-bold">Facebook Page</div>
                                <div className="text-xs text-[var(--muted)]">{selectedPage.name}</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            disabled={!igAccount}
                            onClick={() => igAccount && togglePlatform('instagram')}
                            className={`p-5 border transition-all flex items-center gap-3 rounded-xl text-left ${!igAccount
                                    ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-2)] cursor-not-allowed'
                                    : platforms.includes('instagram')
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]'
                                }`}
                        >
                            <Instagram className="h-5 w-5 shrink-0" />
                            <div>
                                <div className="text-[13px] font-bold">Instagram</div>
                                <div className="text-xs text-[var(--muted)]">
                                    {igAccount ? `@${igAccount.username || igAccount.id}` : 'No linked IG business account'}
                                </div>
                            </div>
                        </button>
                    </div>

                    {platforms.includes('instagram') && (
                        <p className="text-xs text-[var(--muted)] mt-4">
                            Instagram requires at least one image or video — text-only posts are not supported.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default StepAccount;
