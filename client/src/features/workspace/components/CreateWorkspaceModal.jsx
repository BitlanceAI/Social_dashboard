import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, Loader2 } from 'lucide-react';

/**
 * Create-workspace dialog.
 *
 * Replaces window.prompt(), which rendered as a browser chrome alert with no
 * validation, no error surface and no way to match the app's styling. Follows
 * the same shell as AddProfileModal: backdrop click to dismiss, X in the
 * header, Escape to close.
 */
const CreateWorkspaceModal = ({ onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // The parent renders this only while open, so mounting is the reset — a
    // stale draft or error can never reappear, and no effect has to undo state.
    useEffect(() => {
        // The dialog exists to receive one value; go straight to it.
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [saving, onClose]);

    const submit = async (e) => {
        e.preventDefault();

        const trimmed = name.trim();
        if (!trimmed) {
            setError('Give the workspace a name');
            inputRef.current?.focus();
            return;
        }

        setSaving(true);
        setError(null);
        try {
            await onCreate(trimmed);
            onClose();
        } catch (err) {
            setError(err.message || 'Could not create the workspace');
            setSaving(false);
        }
    };

    // Portalled to <body>: this dialog mounts inside the sidebar, and the
    // sidebar's position:sticky creates a stacking context that would trap
    // the overlay's z-index beneath the main content (positioned elements
    // there — media cards, panels — painted over the dialog).
    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => !saving && onClose()}
        >
            <div
                className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-[var(--border)] flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-11 h-11 rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-[var(--accent)]" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight text-[var(--text)]">
                                New Workspace
                            </h3>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-0.5">
                                A separate set of connected accounts
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="p-2 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={submit} className="p-6 space-y-5">
                    <div>
                        <label
                            htmlFor="workspace-name"
                            className="block text-xs text-[var(--accent)] mb-2 flex items-center gap-2"
                        >
                            <span className="w-2 h-2 bg-[var(--accent)]"></span>
                            Workspace name
                        </label>
                        <input
                            id="workspace-name"
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                            placeholder="Acme Corp"
                            maxLength={60}
                            disabled={saving}
                            className={`w-full px-4 py-3 rounded-xl border bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted-2)] focus:outline-none focus:ring-0 transition-colors ${error
                                ? 'border-red-400 focus:border-red-400'
                                : 'border-[var(--border)] focus:border-[var(--accent)]'
                                }`}
                        />
                        <p className="mt-2 text-[12px] text-[var(--muted)] leading-relaxed">
                            {error
                                ? <span className="text-red-500">{error}</span>
                                : 'Usually a client or brand name. Each workspace keeps its own connected accounts, queue and history.'}
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-5 py-2.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !name.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--accent)] text-white text-xs font-bold font-mono uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {saving ? 'Creating' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
};

export default CreateWorkspaceModal;
