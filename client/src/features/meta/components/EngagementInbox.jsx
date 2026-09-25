import React, { useEffect, useMemo, useState } from 'react';
import { Facebook, Inbox, Instagram, MessageCircle, MessagesSquare, RefreshCw } from 'lucide-react';
import API_BASE_URL from '@/shared/config';
import MessagesInbox from '@/features/meta/components/MessagesInbox';

const relativeTime = (iso) => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

const EngagementInbox = ({ authHeaders, onOpenThread }) => {
    const [items, setItems] = useState([]);
    const [feedErrors, setFeedErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [platform, setPlatform] = useState('all');
    const [channel, setChannel] = useState('comments');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/meta/comments/inbox?limit=50`, {
                headers: authHeaders(),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the engagement inbox');
            setItems(data.items || []);
            setFeedErrors(data.feedErrors || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => { void load(); }, 0);
        return () => clearTimeout(timer);
        // The dashboard remounts this panel when its workspace changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleItems = useMemo(
        () => items.filter((item) => platform === 'all' || item.platform === platform),
        [items, platform],
    );

    return (
        <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
            <header className="flex flex-col gap-4 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]"><Inbox className="h-4 w-4" /></span>
                        <div>
                            <h2 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-[var(--text)]">Inbox</h2>
                            <p className="text-xs text-[var(--muted)]">Comments and customer conversations in one place</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {channel === 'comments' && <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
                        {[['all', 'All'], ['facebook', 'Facebook'], ['instagram', 'Instagram']].map(([value, label]) => (
                            <button key={value} onClick={() => setPlatform(value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${platform === value ? 'bg-[var(--accent)] text-[#061414]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>{label}</button>
                        ))}
                    </div>}
                    {channel === 'comments' && <button onClick={load} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50" aria-label="Refresh inbox"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>}
                </div>
            </header>

            <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--bg)] px-5 pt-3 sm:px-6" role="tablist" aria-label="Inbox channel">
                <button role="tab" aria-selected={channel === 'comments'} onClick={() => setChannel('comments')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${channel === 'comments' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}><MessageCircle className="h-4 w-4"/>Comments{items.length > 0 && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--muted)]">{items.length}</span>}</button>
                <button role="tab" aria-selected={channel === 'messages'} onClick={() => setChannel('messages')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${channel === 'messages' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}><MessagesSquare className="h-4 w-4"/>Messages</button>
            </div>

            {channel === 'messages' ? (
                <div role="tabpanel">
                    <MessagesInbox authHeaders={authHeaders} />
                </div>
            ) : <div role="tabpanel">
            {feedErrors.length > 0 && (
                <div className="mx-5 mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:mx-6">
                    Some accounts could not be loaded. Reconnect Meta if their permissions changed.
                </div>
            )}

            <div className="divide-y divide-[var(--border)]">
                {loading && items.length === 0 ? (
                    <p className="p-10 text-center text-sm text-[var(--muted)]">Loading comments…</p>
                ) : error ? (
                    <div className="p-8 text-center"><p className="text-sm text-red-500">{error}</p><button onClick={load} className="mt-3 text-sm font-semibold text-[var(--accent)]">Try again</button></div>
                ) : visibleItems.length === 0 ? (
                    <div className="p-10 text-center"><MessageCircle className="mx-auto h-8 w-8 text-[var(--muted-2)]"/><p className="mt-3 text-sm font-semibold text-[var(--text)]">No comments found</p><p className="mt-1 text-xs text-[var(--muted)]">New comments on recent connected-account posts will appear here.</p></div>
                ) : visibleItems.map((item) => {
                    const PlatformIcon = item.platform === 'instagram' ? Instagram : Facebook;
                    return (
                        <article key={`${item.platform}-${item.id}`} className="group p-5 transition-colors hover:bg-[var(--bg)] sm:p-6">
                            <div className="flex gap-3">
                                {item.comment.authorPicture ? <img src={item.comment.authorPicture} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover"/> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-sm font-bold text-[var(--muted)]">{(item.comment.authorName?.[0] || '?').toUpperCase()}</span>}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-semibold text-[var(--text)]">{item.comment.authorName}</span>
                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--muted)]"><PlatformIcon className="h-3 w-3"/>{item.accountName}</span>
                                        <span className="text-[10px] text-[var(--muted-2)]">{relativeTime(item.comment.createdAt)}</span>
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]">{item.comment.message || 'Comment without text'}</p>
                                    <div className="mt-3 flex items-center justify-between gap-4">
                                        <p className="min-w-0 truncate text-[11px] text-[var(--muted)]">On: {item.post.message || 'Media post'}</p>
                                        <button onClick={() => onOpenThread(item.post)} className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">Open thread</button>
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
            </div>}
        </section>
    );
};

export default EngagementInbox;
