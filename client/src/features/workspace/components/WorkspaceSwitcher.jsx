import React, { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, Check, Plus, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWorkspace } from '@/features/workspace/context/WorkspaceContext';
import CreateWorkspaceModal from '@/features/workspace/components/CreateWorkspaceModal';

/**
 * Active-workspace picker.
 *
 * `compact` renders the pill used in the mobile header strip; the default is
 * the full-width sidebar button.
 */
const WorkspaceSwitcher = ({ compact = false }) => {
    const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace, createWorkspace } = useWorkspace();

    const [open, setOpen] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const containerRef = useRef(null);

    // Close on an outside click or Escape, the way a menu is expected to behave.
    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    // The modal owns the in-flight state and surfaces its own errors; this
    // just performs the create and reports success.
    const handleCreate = async (name) => {
        const workspace = await createWorkspace(name);
        toast.success(`${workspace.name} created`);
        setOpen(false);
    };

    if (!workspaces.length) return null;

    const label = activeWorkspace?.name || 'Workspace';

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={compact
                    ? 'flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text)] max-w-[60vw]'
                    : 'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors text-left'}
            >
                <Building2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">
                    {!compact && (
                        <span className="block text-[9px] font-mono uppercase tracking-widest text-[var(--muted)]">
                            Workspace
                        </span>
                    )}
                    <span className="block text-[13px] font-medium text-[var(--text)] truncate">{label}</span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
            </button>

            {open && (
                <div
                    role="listbox"
                    className={`absolute z-40 mt-2 w-full min-w-[15rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden ${compact ? 'right-0' : 'left-0'}`}
                >
                    <div className="max-h-64 overflow-y-auto py-1">
                        {workspaces.map((workspace) => (
                            <button
                                key={workspace.id}
                                type="button"
                                role="option"
                                aria-selected={workspace.id === activeWorkspaceId}
                                onClick={() => { switchWorkspace(workspace.id); setOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg)] transition-colors"
                            >
                                <span className="w-4 shrink-0">
                                    {workspace.id === activeWorkspaceId && (
                                        <Check className="h-4 w-4 text-[var(--accent)]" />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] text-[var(--text)] truncate">
                                        {workspace.name}
                                    </span>
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                                        {workspace.role}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => { setOpen(false); setShowCreate(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border)] text-[13px] text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--bg)] transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        New workspace
                    </button>
                </div>
            )}

            {showCreate && (
                <CreateWorkspaceModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
};

export default WorkspaceSwitcher;
