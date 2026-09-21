import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import API_BASE_URL from '@/shared/config';

const buttonClass = 'rounded-xl border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';

export default function RevisionDialog({ post, token, workspaceId, onClose, onSubmitted }) {
    const dialog = useRef(null);
    const alive = useRef(true);
    const lock = useRef(false);
    const [draft, setDraft] = useState(null);
    const [caption, setCaption] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        alive.current = true;
        dialog.current?.showModal();
        return () => { alive.current = false; };
    }, []);

    const act = async action => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/${post.id}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify(action === 'resubmit' ? { content: caption, originalContent: draft.originalContent, feedback: draft.feedback } : {}),
            });
            const result = await response.json();
            if (!alive.current) return;
            if (!response.ok) throw new Error(result.error || 'Could not update the revision.');
            if (action === 'revise') {
                setDraft(result);
                setCaption(result.caption);
            } else {
                toast.success(result.message);
                onSubmitted();
            }
        } catch (err) {
            if (alive.current) setError(err.message || 'Could not reach the server.');
        } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
        }
    };

    return <dialog ref={dialog} aria-labelledby="revision-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] p-6 backdrop:bg-black/50">
        <h2 id="revision-title" className="text-xl font-semibold">Revise rejected caption</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Review and edit the AI suggestion before sending it for approval. The existing image or video will be reused.</p>
        <div className="my-5 rounded-xl border-l-4 border-[var(--accent)] bg-[var(--surface-2)] p-4">
            <h3 className="text-sm font-semibold">Reviewer feedback</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{draft?.feedback || post.rejection_comment}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
            <div><h3 className="text-sm font-semibold">Original caption</h3><p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] p-3 text-sm">{draft?.originalContent ?? post.content}</p></div>
            <div>
                <label htmlFor="revision-caption" className="text-sm font-semibold">Revised caption</label>
                {draft ? <textarea id="revision-caption" value={caption} onChange={event => setCaption(event.target.value)} disabled={busy} maxLength={20000} rows={12}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" />
                    : <p className="mt-2 text-sm text-[var(--muted)]">Generate a revision using the reviewer’s feedback. This uses your AI generation allowance.</p>}
            </div>
        </div>
        {draft && <p className="mt-4 text-sm text-[var(--muted)]">The revised post will need fresh approval. If its original scheduled time has passed, it will publish on the next scheduler run after approval.</p>}
        {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button className={buttonClass} disabled={busy} onClick={onClose}>Cancel</button>
            <button className={buttonClass} disabled={busy} onClick={() => act('revise')}>{busy ? 'Working…' : draft ? 'Generate again' : 'Generate revision'}</button>
            {draft && <button className={`${buttonClass} bg-[var(--accent-muted)]`} disabled={busy || !caption.trim()} onClick={() => act('resubmit')}>Resubmit for approval</button>}
        </div>
    </dialog>;
}
