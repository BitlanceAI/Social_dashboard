import React from 'react';
import { X, Plus, Info } from 'lucide-react';
import { platformMeta } from '@/features/meta/lib/providers';

/**
 * "Add Profile" picker.
 *
 * One row per thing you can connect. Facebook and Instagram are the same
 * OAuth flow — Meta has no standalone Instagram login, and an Instagram
 * Business account is only reachable through its linked Page — so the
 * Instagram row says that outright rather than implying two integrations.
 *
 * LinkedIn is split in two because the scope sets genuinely differ: a personal
 * profile is self-serve, a Company Page needs Community Management API
 * approval. The Page row stays disabled until the server confirms the app has
 * it, since requesting an unapproved scope makes LinkedIn reject the whole
 * authorization — profile sign-in included.
 */

const OPTIONS = [
    {
        key: 'facebook',
        platform: 'facebook',
        provider: 'meta',
        title: 'Facebook',
        subtitle: 'Connect page or group',
    },
    {
        key: 'instagram',
        platform: 'instagram',
        provider: 'meta',
        title: 'Instagram',
        subtitle: 'Connect via Facebook · Instagram Business',
    },
    {
        key: 'linkedin-member',
        platform: 'linkedin',
        provider: 'linkedin',
        target: 'member',
        title: 'LinkedIn Profile',
        subtitle: 'Post as yourself',
    },
    {
        key: 'linkedin-org',
        platform: 'linkedin',
        provider: 'linkedin',
        target: 'organization',
        title: 'LinkedIn Page',
        subtitle: 'Post as a company page',
        requiresOrgApproval: true,
    },
];

const AddProfileModal = ({ isOpen, onClose, onSelect, orgConnectAvailable = false }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                    <div>
                        <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">
                            Add Profile
                        </h3>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-1">
                            Choose a network to connect
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    {OPTIONS.map((option) => {
                        const meta = platformMeta(option.platform);
                        const blocked = option.requiresOrgApproval && !orgConnectAvailable;

                        return (
                            <button
                                key={option.key}
                                type="button"
                                disabled={blocked}
                                onClick={() => onSelect(option.provider, option.target)}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${blocked
                                    ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                                    : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--bg)]'
                                    }`}
                            >
                                <span
                                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${meta.brand}1A` }}
                                >
                                    <meta.Icon className="h-5 w-5" style={{ color: meta.brand }} />
                                </span>

                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-mono uppercase tracking-widest text-[var(--text)]">
                                        {option.title}
                                    </span>
                                    <span className="block text-[11px] font-mono uppercase tracking-wide text-[var(--muted)] mt-1 leading-relaxed">
                                        {blocked ? 'Needs LinkedIn approval' : option.subtitle}
                                    </span>
                                </span>

                                {blocked
                                    ? <Info className="h-4 w-4 text-[var(--muted-2)] shrink-0" />
                                    : <Plus className="h-5 w-5 text-[var(--muted)] shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AddProfileModal;
