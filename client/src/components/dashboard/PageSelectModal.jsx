import React, { useEffect, useState } from 'react';
import { Facebook, Instagram, Check, X } from 'lucide-react';

/**
 * Page picker.
 *
 * Meta hands back every Page the user manages. Rather than importing all of
 * them, this asks which ones to actually connect. An Instagram Business
 * account comes along with the Page it is linked to — Meta gives no way to
 * connect one without the other, so the row states that plainly.
 */
const PageSelectModal = ({ isOpen, pages = [], initialSelected = [], onSave, onClose, saving }) => {
    const [selected, setSelected] = useState([]);

    useEffect(() => {
        if (isOpen) setSelected(initialSelected.map(String));
    }, [isOpen, JSON.stringify(initialSelected)]);

    if (!isOpen) return null;

    const toggle = (id) => {
        const key = String(id);
        setSelected(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
    };

    const allIds = pages.map(p => String(p.id));
    const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-['Space_Grotesk'] text-xl font-bold tracking-tight text-[var(--text)] mb-1">
                            Choose what to connect
                        </h3>
                        <p className="text-sm text-[var(--muted)]">
                            Only the profiles you pick will appear in the composer. You can change
                            this later.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-[var(--border)] flex items-center justify-between">
                    <span className="text-sm text-[var(--muted)]">
                        {selected.length} of {pages.length} selected
                    </span>
                    <button
                        onClick={() => setSelected(allSelected ? [] : allIds)}
                        className="text-xs text-[var(--accent)] hover:underline"
                    >
                        {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {pages.map(page => {
                        const isOn = selected.includes(String(page.id));
                        const ig = page.instagram_business_account;
                        return (
                            <button
                                key={page.id}
                                onClick={() => toggle(page.id)}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-colors ${isOn
                                    ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
                                    }`}
                            >
                                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${isOn
                                    ? 'bg-[var(--accent)] border-[var(--accent)]'
                                    : 'border-[var(--border)]'
                                    }`}>
                                    {isOn && <Check className="h-3.5 w-3.5 text-white" />}
                                </span>

                                {page.picture?.data?.url ? (
                                    <img src={page.picture.data.url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                                ) : (
                                    <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                                        <Facebook className="h-5 w-5 text-[var(--accent)]" />
                                    </span>
                                )}

                                <span className="min-w-0 flex-1">
                                    <span className="block font-medium text-[var(--text)] truncate">{page.name}</span>
                                    <span className="block text-sm text-[var(--muted)] truncate">
                                        Facebook Page{page.category ? ` · ${page.category}` : ''}
                                    </span>
                                    {ig?.username && (
                                        <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--accent)]">
                                            <Instagram className="h-3 w-3" />
                                            @{ig.username} included
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}

                    {pages.length === 0 && (
                        <p className="text-sm text-[var(--muted)] text-center py-8">
                            No Facebook Pages were returned for this account.
                        </p>
                    )}
                </div>

                <div className="p-6 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-4">
                    <p className="text-xs text-[var(--muted)]">
                        Instagram accounts connect through their linked Page.
                    </p>
                    <button
                        onClick={() => onSave(selected)}
                        disabled={saving}
                        className="px-6 py-2.5 rounded-full bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 shrink-0"
                    >
                        {saving ? 'Saving…' : `Connect ${selected.length || 'no'} profile${selected.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PageSelectModal;
