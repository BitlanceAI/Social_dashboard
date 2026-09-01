import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-react';

/**
 * Delete-workspace confirmation.
 *
 * Deleting a workspace disconnects its Meta/LinkedIn accounts, drops its
 * scheduled posts and members, and permanently deletes its stored media —
 * so the dialog spells that out and requires the workspace name typed back
 * before the button arms. Portalled like CreateWorkspaceModal (the sticky
 * sidebar's stacking context would otherwise trap the overlay).
 */
const DeleteWorkspaceModal = ({ workspace, onClose, onDelete }) => {
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape' && !deleting) onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [deleting, onClose]);

    const armed = confirmText.trim() === workspace.name;

    const submit = async (e) => {
        e.preventDefault();
        if (!armed || deleting) return;
        setDeleting(true);
        setError(null);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            setError(err.message || 'Could not delete the workspace');
            setDeleting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => !deleting && onClose()}
        >
            <div
                className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-[var(--border)] flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(248, 113, 113, 0.1)' }}>
                            <Trash2 className="h-5 w-5" style={{ color: '#F87171' }} />
                        </span>
                        <div className="min-w-0">
                            <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">
                                Delete {workspace.name}
                            </h3>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-0.5">
                                This cannot be undone
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={deleting}
                        className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={submit} className="p-6 space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'rgba(248, 113, 113, 0.4)', background: 'rgba(248, 113, 113, 0.08)' }}>
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#F87171' }} />
                        <span className="text-[13px] text-[var(--text)] leading-relaxed">
                            Deleting this workspace <strong>disconnects its Meta and LinkedIn accounts</strong>,
                            removes its scheduled posts, queue and members, and{' '}
                            <strong>permanently deletes every file in its media library</strong>.
                        </span>
                    </div>

                    <div>
                        <label htmlFor="confirm-workspace-name" className="block text-xs text-[var(--muted)] mb-2">
                            Type <strong className="text-[var(--text)]">{workspace.name}</strong> to confirm
                        </label>
                        <input
                            id="confirm-workspace-name"
                            ref={inputRef}
                            type="text"
                            value={confirmText}
                            onChange={(e) => { setConfirmText(e.target.value); if (error) setError(null); }}
                            placeholder={workspace.name}
                            disabled={deleting}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:ring-0 focus:border-[#F87171] transition-colors"
                        />
                        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={deleting}
                            className="px-5 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!armed || deleting}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold font-mono uppercase tracking-widest text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: '#EF4444' }}
                        >
                            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {deleting ? 'Deleting' : 'Delete workspace'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
};

export default DeleteWorkspaceModal;
