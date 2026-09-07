import React, { useState, useEffect } from 'react';
import { X, Check, Building2, Facebook, Instagram } from 'lucide-react';

/**
 * Agency flow: assign Pages from the currently connected account to another
 * workspace (client) — no reconnect needed. Pick a target workspace and the
 * Pages to place there; the token is reused, only the selection differs.
 */
const AssignPagesModal = ({ isOpen, pages = [], workspaces = [], currentWorkspaceId, onAssign, onClose, saving }) => {
    const [targetId, setTargetId] = useState('');
    const [selected, setSelected] = useState([]);

    // Other workspaces the user can assign into (not the current one).
    const targets = workspaces.filter((w) => w.id !== currentWorkspaceId);

    useEffect(() => {
        if (!isOpen) return undefined;
        const t = setTimeout(() => {
            setSelected([]);
            setTargetId(targets[0]?.id || '');
        }, 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const toggle = (id) => {
        const key = String(id);
        setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-['Space_Grotesk'] text-xl font-bold tracking-tight text-[var(--text)] mb-1">
                            Assign Pages to a workspace
                        </h3>
                        <p className="text-sm text-[var(--muted)]">
                            Place Pages from this account into another workspace — no reconnect needed.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {targets.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[var(--muted)]">
                        You only have one workspace. Create another workspace first to assign Pages to it.
                    </div>
                ) : (
                    <>
                        {/* Target workspace */}
                        <div className="px-6 py-4 border-b border-[var(--border)]">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">
                                Assign to workspace
                            </label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                                <Building2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
                                <select
                                    value={targetId}
                                    onChange={(e) => setTargetId(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-[var(--text)] outline-none"
                                >
                                    {targets.map((w) => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Page checklist */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {pages.map((page) => {
                                const isOn = selected.includes(String(page.id));
                                const ig = page.instagram_business_account;
                                return (
                                    <button
                                        key={page.id}
                                        onClick={() => toggle(page.id)}
                                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-colors ${isOn ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'}`}
                                    >
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${isOn ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
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
                                            <span className="block text-sm text-[var(--muted)] truncate">Facebook Page{page.category ? ` · ${page.category}` : ''}</span>
                                            {ig?.username && (
                                                <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--accent)]">
                                                    <Instagram className="h-3 w-3" /> @{ig.username} included
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                            {pages.length === 0 && (
                                <p className="text-sm text-[var(--muted)] text-center py-8">No Pages available on this account.</p>
                            )}
                        </div>

                        <div className="p-6 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-4">
                            <p className="text-xs text-[var(--muted)]">{selected.length} selected</p>
                            <button
                                onClick={() => onAssign(targetId, selected)}
                                disabled={saving || !targetId || selected.length === 0}
                                className="px-6 py-2.5 rounded-full bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 shrink-0"
                            >
                                {saving ? 'Assigning…' : `Assign ${selected.length || ''} Page${selected.length === 1 ? '' : 's'}`.trim()}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AssignPagesModal;
