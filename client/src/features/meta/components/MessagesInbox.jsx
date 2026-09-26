import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Send } from 'lucide-react';
import API_BASE_URL from '@/shared/config';

const button = 'rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50';
const timestamp = t => t ? new Date(t).toLocaleString() : '';

export default function MessagesInbox({ authHeaders }) {
    const headers = useRef(authHeaders);
    useEffect(() => { headers.current = authHeaders; }, [authHeaders]);
    const [threads, setThreads] = useState([]);
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [provider, setProvider] = useState('all');
    const [text, setText] = useState('');
    const [allowed, setAllowed] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [nextThreadOffset, setNextThreadOffset] = useState(null);
    const [nextMessageOffset, setNextMessageOffset] = useState(null);
    const [historyPaused, setHistoryPaused] = useState(false);
    const active = useRef(null);
    const sendLock = useRef(false);
    const request = useRef(null);
    const historyExpanded = useRef(false);
    const threadsExpanded = useRef(false);

    const api = useCallback(async (path, body, signal) => {
        const response = await fetch(`${API_BASE_URL}/api/meta/inbox${path}`, {
            method: body ? 'POST' : 'GET', signal,
            headers: { ...headers.current(), 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load messages.');
        return data;
    }, []);

    const loadThreads = useCallback(async (signal, offset = 0) => {
        const data = await api(`/conversations?provider=${provider}&offset=${offset}`, null, signal);
        setThreads(old => offset ? [...old, ...data.conversations.filter(t => !old.some(o => o.id === t.id))] : data.conversations);
        setNextThreadOffset(data.nextOffset);
    }, [api, provider]);

    useEffect(() => {
        const controller = new AbortController();
        let running = false;
        async function refresh() {
            if (running || document.hidden || threadsExpanded.current) return;
            running = true;
            try { await loadThreads(controller.signal); setError(''); }
            catch (e) { if (e.name !== 'AbortError') setError(e.message); }
            finally { running = false; if (!controller.signal.aborted) setLoading(false); }
        }
        void refresh();
        const timer = setInterval(refresh, 15000);
        return () => { clearInterval(timer); controller.abort(); };
    }, [loadThreads]);

    useEffect(() => {
        if (!selected) return undefined;
        const controller = new AbortController();
        let running = false;
        async function refresh() {
            if (running || document.hidden || historyExpanded.current) return;
            running = true;
            try {
                const data = await api(`/conversations/${selected.id}/messages`, null, controller.signal);
                if (active.current !== selected.id) return;
                setMessages(data.messages); setAllowed(data.canReply); setNextMessageOffset(data.nextOffset);
                await api(`/conversations/${selected.id}/read`, {}, controller.signal);
            } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
            finally { running = false; }
        }
        void refresh();
        const timer = setInterval(refresh, 10000);
        return () => { clearInterval(timer); controller.abort(); };
    }, [api, selected]);

    async function subscribe() {
        setBusy(true); setError(''); setNotice('');
        try {
            const data = await api('/subscribe', {});
            setNotice(data.outcomes.length ? data.outcomes.map(o => `${o.name} (${o.source || o.provider}): ${o.success ? 'connected' : o.error}`).join(' · ')
                : 'Connect a Facebook Page or an Instagram Login account in Social Profiles first.');
            await loadThreads();
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    }

    function openThread(thread) {
        historyExpanded.current = false;
        setHistoryPaused(false);
        setNextMessageOffset(null);
        active.current = thread?.id || null; setSelected(thread); setMessages([]); setAllowed(false);
        setText(''); setError(''); request.current = null;
    }

    async function send(event) {
        event.preventDefault();
        if (sendLock.current || !text.trim() || !allowed) return;
        sendLock.current = true; setBusy(true); setError('');
        const id = selected.id;
        request.current ||= crypto.randomUUID();
        try {
            const data = await api(`/conversations/${id}/reply`, { text: text.trim(), requestId: request.current });
            if (!data.success) throw new Error('This reply is still pending or was not confirmed. Refresh before sending again.');
            if (active.current === id) {
                setText(''); request.current = null;
                const updated = await api(`/conversations/${id}/messages`);
                if (active.current === id) { setMessages(updated.messages); setAllowed(updated.canReply); }
            }
            await loadThreads();
        } catch (e) { setError(e.message); }
        finally { sendLock.current = false; setBusy(false); }
    }

    async function moreMessages() {
        historyExpanded.current = true;
        setHistoryPaused(true);
        try {
            const id = selected.id;
            const data = await api(`/conversations/${id}/messages?offset=${nextMessageOffset}`);
            if (active.current === id) { setMessages(old => [...data.messages.filter(m => !old.some(o => o.id === m.id)), ...old]); setNextMessageOffset(data.nextOffset); }
        } catch (e) { setError(e.message); }
    }

    return <div>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
            <label className="text-sm text-[var(--muted)]">Channel <select aria-label="Message platform" value={provider} onChange={e => { threadsExpanded.current = false; setProvider(e.target.value); openThread(null); }} className="rounded-lg bg-[var(--bg)] p-2 text-[var(--text)]"><option value="all">All</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></label>
            <button className={button} disabled={busy} onClick={subscribe}>Connect messaging</button>
            <button className={button} aria-label="Refresh conversations" onClick={() => { threadsExpanded.current = false; loadThreads().catch(e => setError(e.message)); }}><RefreshCw size={16}/></button>
        </div>
        {error && <p role="alert" className="m-4 rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--text)]">{error}</p>}
        {notice && <p role="status" className="m-4 text-sm text-[var(--muted)]">{notice}</p>}
        <div className="grid min-h-[480px] md:grid-cols-[260px_1fr]">
            <aside aria-label="Conversations" className={`${selected ? 'hidden md:block' : ''} max-h-[650px] overflow-y-auto border-r border-[var(--border)] p-2`}>
                {loading ? <p className="p-5 text-sm text-[var(--muted)]">Loading conversations…</p> : threads.length === 0 && <p className="p-5 text-sm text-[var(--muted)]">No conversations yet. Connect messaging, then have someone send your account a message. Only messages received after connecting appear here.</p>}
                {threads.map(t => <button key={t.id} onClick={() => openThread(t)} aria-pressed={selected?.id === t.id} className={`mb-1 w-full rounded-xl p-3 text-left ${selected?.id === t.id ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--bg)]'}`}>
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{t.unread && '● '}Customer · {t.participant_id.slice(-6)}</span>
                    <span className="block text-xs text-[var(--accent)]">{t.social_message_accounts.name} · {t.social_message_accounts.provider}{t.social_message_accounts.connection_type === 'instagram_login' ? ' (Instagram Login)' : ''}</span>
                    <span className="mt-2 block truncate text-xs text-[var(--muted)]">{t.preview || 'Attachment'}</span>
                    <span className="mt-1 block text-[10px] text-[var(--muted)]">{timestamp(t.last_message_at)}</span>
                </button>)}
                {nextThreadOffset !== null && <button className={button} onClick={() => { threadsExpanded.current = true; loadThreads(undefined, nextThreadOffset).catch(e => setError(e.message)); }}>More conversations</button>}
            </aside>
            <div className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-col`}>
                {!selected ? <p className="m-auto p-8 text-sm text-[var(--muted)]">Choose a conversation to read and reply.</p> : <>
                    <div className="flex items-center gap-3 border-b border-[var(--border)] p-4"><button className={`${button} md:hidden`} onClick={() => openThread(null)} aria-label="Back to conversations"><ArrowLeft size={16}/></button><div><p className="text-sm font-semibold text-[var(--text)]">Customer · {selected.participant_id.slice(-6)}</p><p className="text-xs text-[var(--muted)]">Replying as {selected.social_message_accounts.name}</p></div></div>
                    <div className="flex max-h-[480px] min-h-64 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-label="Message history">
                        {historyPaused && <p className="text-xs text-[var(--muted)]">Live updates paused while browsing history. Reopen this conversation to resume.</p>}
                        {nextMessageOffset !== null && <button className={button} onClick={moreMessages}>Older messages</button>}
                        {messages.map(m => <article key={m.id} className={`max-w-[90%] rounded-2xl p-3 ${m.direction === 'outbound' ? 'self-end bg-[var(--accent-muted)]' : 'self-start bg-[var(--bg)]'}`}>
                            <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">{m.text}</p>
                            {(m.attachments || []).filter(a => /^https:\/\//i.test(a.url || '')).map((a, i) => <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm underline text-[var(--accent)]">Open {a.type || 'attachment'}</a>)}
                            <p className="mt-2 text-[10px] text-[var(--muted)]">{timestamp(m.sent_at)} · {m.status}</p>
                        </article>)}
                    </div>
                    <form onSubmit={send} className="border-t border-[var(--border)] p-4">
                        {!allowed && <p className="mb-2 text-xs text-[var(--muted)]">Replies are available for 24 hours after the customer's latest message.</p>}
                        <div className="flex items-end gap-2"><textarea aria-label="Reply message" rows={2} maxLength={1000} disabled={!allowed || busy} value={text} onChange={e => { setText(e.target.value); request.current = null; }} placeholder="Write a reply…" className="min-w-0 flex-1 resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--text)]"/><button className={button} disabled={!allowed || busy || !text.trim()} aria-label="Send reply"><Send size={18}/></button></div>
                        <p className="mt-1 text-right text-[10px] text-[var(--muted)]">{text.length}/1000</p>
                    </form>
                </>}
            </div>
        </div>
    </div>;
}
