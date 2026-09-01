import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle, Send, Eye, EyeOff, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import API_BASE_URL from '@/shared/config';

const timeAgo = (iso, now = Date.now()) => {
    const diff = now - new Date(iso).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < DAY) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / DAY)}d ago`;
};

/**
 * Comment manager for one Facebook post: read the thread, reply as the
 * Page, hide/unhide, delete. Facebook only — moderating Instagram comments
 * needs instagram_manage_comments, which this app does not request.
 */
const CommentsModal = ({ post, authHeaders, onClose }) => {
    const [comments, setComments] = useState(null);
    const [loading, setLoading] = useState(true);
    const [replyTo, setReplyTo] = useState(null);   // comment id
    const [replyText, setReplyText] = useState('');
    const [busy, setBusy] = useState({});           // comment id -> action in flight

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${API_BASE_URL}/api/meta/posts/${post.id}/comments?pageId=${encodeURIComponent(post.pageId)}`,
                { headers: authHeaders() },
            );
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Could not load comments');
            setComments(data.comments);
        } catch (err) {
            toast.error(err.message);
            setComments([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [post.id, post.pageId]);

    useEffect(() => {
        const t = setTimeout(load, 0);
        return () => clearTimeout(t);
    }, [load]);

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const act = async (commentId, fn) => {
        if (busy[commentId]) return;
        setBusy((b) => ({ ...b, [commentId]: true }));
        try {
            await fn();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusy((b) => ({ ...b, [commentId]: false }));
        }
    };

    const call = async (path, options) => {
        const res = await fetch(`${API_BASE_URL}${path}`, {
            headers: { ...authHeaders() },
            ...options,
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'The action failed');
        return data;
    };

    const handleReply = (commentId) => act(commentId, async () => {
        const message = replyText.trim();
        if (!message) return;
        await call(`/api/meta/comments/${commentId}/reply`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: post.pageId, message }),
        });
        toast.success('Reply posted as your Page');
        setReplyTo(null);
        setReplyText('');
        load();
    });

    const handleHide = (comment) => act(comment.id, async () => {
        await call(`/api/meta/comments/${comment.id}/hide`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: post.pageId, hidden: !comment.isHidden }),
        });
        setComments((list) => list.map((c) =>
            c.id === comment.id ? { ...c, isHidden: !comment.isHidden } : c));
        toast.success(comment.isHidden ? 'Comment unhidden' : 'Comment hidden from the public');
    });

    const handleDelete = (comment) => act(comment.id, async () => {
        await call(`/api/meta/comments/${comment.id}?pageId=${encodeURIComponent(post.pageId)}`, {
            method: 'DELETE',
        });
        setComments((list) => list.filter((c) => c.id !== comment.id));
        toast.success('Comment deleted');
    });

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-[var(--border)] flex items-start gap-3">
                    <MessageCircle className="h-5 w-5 shrink-0 mt-0.5 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                        <h3 className="font-['Space_Grotesk'] text-base font-extrabold tracking-tight text-[var(--text)]">
                            Comments
                        </h3>
                        <p className="text-[12px] text-[var(--muted)] truncate">{post.message || post.pageName}</p>
                    </div>
                    <button
                        onClick={load}
                        className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors" aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Thread */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {loading && comments === null ? (
                        <p className="text-sm text-[var(--muted)] text-center py-6">Loading comments…</p>
                    ) : !comments?.length ? (
                        <p className="text-sm text-[var(--muted)] text-center py-6">No comments on this post yet.</p>
                    ) : (
                        comments.map((c) => (
                            <div key={c.id} className={`rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 ${c.isHidden ? 'opacity-60' : ''}`}>
                                <div className="flex items-start gap-3">
                                    {c.authorPicture ? (
                                        <img src={c.authorPicture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                    ) : (
                                        <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--muted)] text-xs font-semibold flex items-center justify-center shrink-0">
                                            {(c.authorName[0] || '?').toUpperCase()}
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[13px] font-medium text-[var(--text)]">{c.authorName}</span>
                                            <span className="text-[10px] font-mono text-[var(--muted-2)]">{timeAgo(c.createdAt)}</span>
                                            {c.isHidden && (
                                                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--muted)]">hidden</span>
                                            )}
                                        </div>
                                        <p className="text-[13px] text-[var(--text)] mt-1 whitespace-pre-wrap break-words">{c.message}</p>
                                        <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--muted)]">
                                            {c.likeCount > 0 && <span>{c.likeCount} likes</span>}
                                            {c.replyCount > 0 && <span>{c.replyCount} replies</span>}
                                            <button
                                                onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}
                                                className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                                            >
                                                Reply
                                            </button>
                                            {c.canHide && (
                                                <button
                                                    onClick={() => handleHide(c)}
                                                    disabled={busy[c.id]}
                                                    className="inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors disabled:opacity-50"
                                                >
                                                    {c.isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                                    {c.isHidden ? 'Unhide' : 'Hide'}
                                                </button>
                                            )}
                                            {c.canRemove && (
                                                <button
                                                    onClick={() => handleDelete(c)}
                                                    disabled={busy[c.id]}
                                                    className="inline-flex items-center gap-1 hover:text-red-500 transition-colors disabled:opacity-50"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    Delete
                                                </button>
                                            )}
                                        </div>

                                        {/* Inline reply, sent as the Page */}
                                        {replyTo === c.id && (
                                            <div className="flex items-center gap-2 mt-3">
                                                <input
                                                    autoFocus
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleReply(c.id); }}
                                                    placeholder={`Reply as ${post.pageName}…`}
                                                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--muted-2)]"
                                                />
                                                <button
                                                    onClick={() => handleReply(c.id)}
                                                    disabled={busy[c.id] || !replyText.trim()}
                                                    className="btn-primary p-2.5 rounded-xl disabled:opacity-50"
                                                    title="Send reply"
                                                >
                                                    <Send className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default CommentsModal;
