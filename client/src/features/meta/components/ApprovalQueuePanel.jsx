import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Clock, MessageCircle, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import API_BASE_URL from '@/shared/config';

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed';
const formatTime = (value, timezone) => {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    try { return date.toLocaleString(undefined, { timeZone: timezone || undefined, dateStyle: 'medium', timeStyle: 'short' }) + (timezone ? ` (${timezone})` : ''); }
    catch { return date.toLocaleString(); }
};
const statusLabels = { pending: 'Approved · Scheduled', processing: 'Publishing', scheduled: 'Scheduled with platform' };
const reviewerLabel = value => {
    if (!value) return 'Not recorded';
    if (value.startsWith('dashboard:')) return `Dashboard user (${value.slice('dashboard:'.length)})`;
    if (value === 'dashboard') return 'Dashboard';
    return /^\d+$/.test(value) ? `+${value}` : value;
};

export default function ApprovalQueuePanel({ queue, token, workspaceId, onChanged }) {
    const [section, setSection] = useState('pending');
    const [busy, setBusy] = useState(null);
    const [decision, setDecision] = useState(null);
    const [reason, setReason] = useState('');
    const alive = useRef(true);
    const actionLock = useRef(false);
    const dialog = useRef(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { if (decision) dialog.current?.showModal(); }, [decision]);

    const act = async (post, action) => {
        if (actionLock.current) return;
        actionLock.current = true;
        setBusy(post.id);
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/${post.id}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId, 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
                body: JSON.stringify(action === 'reject' ? { reason } : {}),
            });
            const data = await response.json();
            if (!alive.current) return;
            if (!response.ok) {
                if (response.status === 409) toast('This post was already decided. The queue has been refreshed.');
                else toast.error(data.error || 'Could not update this post.');
            } else toast.success(data.message || 'Post updated.');
            setDecision(null);
            await queue.refresh();
            if (alive.current) onChanged?.();
        } catch {
            if (alive.current) toast.error('Could not reach the server. Refresh before trying again.');
        } finally {
            actionLock.current = false;
            if (alive.current) setBusy(null);
        }
    };
    const posts = (section === 'pending' ? queue.data?.posts : queue.data?.[`${section}Posts`]) || [];
    const count = queue.data?.[`${section}Count`] || 0;
    const page = queue[`${section}Page`];
    const pages = Math.max(1, Math.ceil(count / (queue.data?.pageSize || 25)));

    return (
        <section aria-labelledby="approval-heading" className="space-y-6" style={{ '--muted': 'color-mix(in srgb, var(--text) 70%, var(--bg))' }}>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2">Review before publishing</p>
                    <h1 id="approval-heading" className="text-3xl font-semibold tracking-tight text-[var(--text)]">Approval Queue</h1>
                    <p className="text-sm text-[var(--muted)] mt-2">Review scheduled posts here or on WhatsApp. The first decision wins.</p>
                </div>
                <button className={buttonClass} disabled={queue.loading} onClick={queue.refresh}><RefreshCw size={16} className={queue.loading ? 'animate-spin' : ''} />Refresh</button>
            </header>
            <div className="flex flex-wrap gap-2" aria-label="Approval sections">
                {[['pending', 'Pending approval', queue.data?.pendingCount], ['approved', 'Approved / Scheduled', queue.data?.approvedCount], ['rejected', 'Rejected', queue.data?.rejectedCount]].map(([key, label, total]) => (
                    <button key={key} aria-pressed={section === key} onClick={() => setSection(key)} className={`${buttonClass} ${section === key ? 'bg-[var(--accent-muted)] border-[var(--accent)]' : ''}`}>
                        {label}<span className="font-mono text-xs">{total ?? '—'}</span>
                    </button>
                ))}
            </div>
            {queue.error && <div role="alert" className="rounded-xl border border-[var(--border)] p-4 text-[var(--text)]">{queue.error} <button className={buttonClass} onClick={queue.refresh}>Retry</button></div>}
            {!queue.data && !queue.error ? <p role="status" className="text-[var(--muted)]">Loading approval queue…</p> : posts.length === 0 && !queue.error ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
                    <CheckCircle2 className="mx-auto mb-3 text-[var(--accent)]" size={32} />
                    <h2 className="text-lg text-[var(--text)]">{section === 'pending' ? 'No posts waiting for approval' : section === 'rejected' ? 'No rejected posts' : 'No approved posts awaiting publication'}</h2>
                    <p className="text-sm text-[var(--muted)] mt-2">{section === 'pending' ? 'Schedule a post with approver numbers to send it for review.' : section === 'rejected' ? 'Posts rejected on WhatsApp or in the dashboard appear here with reviewer feedback.' : 'Approved posts appear here until publishing finishes.'}</p>
                </div>
            ) : <div className="space-y-4" aria-busy={queue.loading}>
                {posts.map(post => (
                    <article key={post.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                        <div className="flex flex-col sm:flex-row">
                            {!!post.media_urls?.length && <div className="sm:w-48 shrink-0 p-3 flex sm:flex-col gap-2 overflow-x-auto">
                                {post.media_urls.map((url, index) => /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.test(url) ?
                                    <video key={url} src={url} controls preload="metadata" aria-label={`Post video ${index + 1}`} className="w-40 sm:w-full max-h-48 rounded-lg object-contain" /> :
                                    <img key={url} src={url} alt={`Post attachment ${index + 1}`} loading="lazy" className="w-40 sm:w-full max-h-48 rounded-lg object-contain" />)}
                            </div>}
                            <div className="flex-1 min-w-0 p-5 space-y-3">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <h2 className="font-semibold text-[var(--text)]">{post.page_name || 'Social account'}</h2>
                                    <span className="text-xs rounded-full px-2.5 py-1 bg-[var(--accent-muted)] text-[var(--accent)]">{section === 'pending' ? 'Pending approval' : section === 'rejected' ? 'Rejected · Will not publish' : statusLabels[post.status] || post.status}</span>
                                </div>
                                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{(post.platforms?.length ? post.platforms : [post.provider === 'linkedin' ? 'linkedin' : 'facebook']).join(' · ')}</p>
                                <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">{post.content || 'No caption'}</p>
                                {post.link_url && <p className="text-sm break-all text-[var(--muted)]">{post.link_url}</p>}
                                <p className="text-xs text-[var(--muted)] flex gap-2"><Clock size={14} className="shrink-0" />{formatTime(post.scheduled_time, post.timezone)}</p>
                                <p className="text-xs text-[var(--muted)] break-words">Approvers: {(post.approver_phones || []).map(phone => `+${phone}`).join(', ') || 'None recorded'}</p>
                                <p className="text-xs text-[var(--muted)]">{post.approval_sent_at ? `WhatsApp request sent ${formatTime(post.approval_sent_at)} · Delivery not confirmed` : 'WhatsApp request not sent or send not confirmed'}</p>
                                {section === 'rejected' && <div className="rounded-xl border-l-4 border-[var(--accent)] bg-[var(--surface-2)] p-4 space-y-2">
                                    <h3 className="text-sm font-semibold text-[var(--text)]">Rejection feedback</h3>
                                    <p className="text-xs text-[var(--muted)] break-words">Rejected by: {reviewerLabel(post.rejected_by)}</p>
                                    <p className="text-xs text-[var(--muted)]">Rejected at: {formatTime(post.rejected_at, post.timezone)}</p>
                                    <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">{post.rejection_comment || (post.awaiting_rejection_feedback ? 'Waiting for feedback from the reviewer.' : 'No reason provided.')}</p>
                                </div>}
                                {section === 'pending' && <div className="flex flex-wrap gap-2 pt-2">
                                    <button disabled={!!busy || queue.loading || !!queue.error} className={`${buttonClass} bg-[var(--accent-muted)]`} onClick={() => { setReason(''); setDecision({ post, action: 'approve', overdue: new Date(post.scheduled_time).getTime() <= Date.now() }); }}><Check size={16} />Approve</button>
                                    <button disabled={!!busy || queue.loading || !!queue.error} className={buttonClass} onClick={() => { setReason(''); setDecision({ post, action: 'reject' }); }}><X size={16} />Reject</button>
                                    <button disabled={!!busy || queue.loading || !!queue.error} className={buttonClass} onClick={() => act(post, 'resend')}><MessageCircle size={16} />{busy === post.id ? 'Working…' : 'Resend WhatsApp request'}</button>
                                </div>}
                            </div>
                        </div>
                    </article>
                ))}
            </div>}
            {count > 0 && <nav aria-label="Queue pagination" className="flex items-center justify-between gap-2 text-sm text-[var(--muted)]">
                <button className={buttonClass} disabled={page <= 1 || queue.loading} onClick={() => queue.setPage(section, page - 1)}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button className={buttonClass} disabled={page >= pages || queue.loading} onClick={() => queue.setPage(section, page + 1)}>Next</button>
            </nav>}
            {decision && <dialog ref={dialog} aria-labelledby="approval-decision-title" onCancel={event => { if (busy) event.preventDefault(); else setDecision(null); }} className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] p-6 backdrop:bg-black/50">
                <h2 id="approval-decision-title" className="text-xl font-semibold">{decision.action === 'approve' ? 'Approve this post?' : 'Reject this post?'}</h2>
                <p className="text-sm text-[var(--muted)] my-4">{decision.action === 'reject' ? 'This post will be cancelled and will not publish.' : decision.overdue ? 'The scheduled time has passed. Approving will publish this post on the next scheduler run.' : `It will publish at ${formatTime(decision.post.scheduled_time, decision.post.timezone)}. If that time passes before approval, it will publish on the next scheduler run.`}</p>
                {decision.action === 'reject' && <label className="block text-sm">Reason (optional)<textarea autoFocus value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" rows={3} /></label>}
                <div className="flex justify-end gap-2 mt-5">
                    <button className={buttonClass} disabled={!!busy} onClick={() => setDecision(null)}>Cancel</button>
                    <button className={`${buttonClass} bg-[var(--accent-muted)]`} disabled={!!busy} onClick={() => act(decision.post, decision.action)}>{busy ? 'Saving…' : decision.action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</button>
                </div>
            </dialog>}
        </section>
    );
}
