import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CirclePause, CirclePlay, Clock3, RefreshCw, Repeat2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { repostApi } from '../lib/repostApi';

const field = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]';
const button = 'rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';
const status = post => post.deliveries?.length ? post.deliveries.map(d => d.status).join(', ') : post.state;

export default function InstagramRepostPanel({ workspaceId, targets }) {
    const pages = targets.filter(t => t.provider === 'meta');
    const [watches, setWatches] = useState([]);
    const [posts, setPosts] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState('');
    const [form, setForm] = useState({ sourceHandle: '', targets: [], mode: 'review',
        approverPhones: '', checksPerDay: 1, scrapeLimit: 24, gapMinutes: 60 });
    const selected = watches.find(w => w.id === selectedId);
    const load = useCallback(async () => {
        if (!workspaceId) return;
        const data = await repostApi(workspaceId, '/watches');
        setWatches(data.watches);
        setSelectedId(current => current && data.watches.some(w => w.id === current) ? current : data.watches[0]?.id || null);
    }, [workspaceId]);
    useEffect(() => {
        if (!workspaceId) return;
        repostApi(workspaceId, '/watches').then(data => {
            setWatches(data.watches);
            setSelectedId(current => current && data.watches.some(w => w.id === current) ? current : data.watches[0]?.id || null);
        }).catch(e => toast.error(e.message));
    }, [workspaceId]);
    useEffect(() => {
        if (!selectedId) return;
        repostApi(workspaceId, `/watches/${selectedId}/posts`).then(data => setPosts(data.posts))
            .catch(e => toast.error(e.message));
    }, [workspaceId, selectedId]);
    const refresh = async () => {
        await load();
        if (selectedId) setPosts((await repostApi(workspaceId, `/watches/${selectedId}/posts`)).posts);
    };
    const act = async (key, path, body = {}) => {
        setBusy(key);
        try {
            const result = await repostApi(workspaceId, path, { method: 'POST', body });
            toast.success(result.skipped ? 'Already handled' : 'Updated');
            await refresh();
            return result;
        } catch (error) { toast.error(error.message); return null; }
        finally { setBusy(''); }
    };
    const create = async event => {
        event.preventDefault();
        setBusy('create');
        try {
            const result = await repostApi(workspaceId, editingId ? `/watches/${editingId}` : '/watches', { method: editingId ? 'PUT' : 'POST', body: {
                ...form, approverPhones: form.approverPhones.split(/[,;\s]+/).filter(Boolean),
                checksPerDay: Number(form.checksPerDay), scrapeLimit: Number(form.scrapeLimit), gapMinutes: Number(form.gapMinutes),
            } });
            toast.success(editingId ? 'Watch settings updated' : 'Watch created. Run its first check to import existing posts.');
            await load();
            setSelectedId(result.watch.id);
            setEditingId(null);
            setForm(previous => ({ ...previous, sourceHandle: '' }));
        } catch (error) { toast.error(error.message); }
        finally { setBusy(''); }
    };
    const togglePage = page => {
        const selected = form.targets.some(t => t.pageId === page.id);
        setForm({ ...form, targets: selected ? form.targets.filter(t => t.pageId !== page.id)
            : [...form.targets, { pageId: page.id, platforms: page.platforms.includes('instagram') ? ['instagram'] : ['facebook'] }] });
    };

    return <div className="space-y-7 text-[var(--text)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"><Repeat2 size={15} /> Source monitor</div>
                <h1 className="text-3xl font-semibold tracking-tight">Instagram Repost</h1>
                <p className="mt-2 text-sm text-[var(--muted)]">Bring public posts into your workspace, review them, then publish to connected accounts.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"><strong>{watches.length}</strong> watched source{watches.length === 1 ? '' : 's'}</div>
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">{editingId ? 'Edit watch' : 'Watch a source'}</h2>
            <p className="mb-5 mt-1 text-sm text-[var(--muted)]">Your first check imports existing posts for review. Newer posts follow the mode you choose.</p>
            <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">Public Instagram handle<input className={`${field} mt-1`} placeholder="@sourceaccount" value={form.sourceHandle} required readOnly={!!editingId}
                    onChange={e => setForm({ ...form, sourceHandle: e.target.value })} /></label>
                <div className="text-sm sm:col-span-2">Destination accounts <span className="text-xs text-[var(--muted)]">(choose one or more)</span>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">{pages.map(page => {
                        const choice = form.targets.find(t => t.pageId === page.id);
                        return <div key={page.id} className="rounded-xl border border-[var(--border)] p-3">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={!!choice} onChange={() => togglePage(page)} />
                                <span>{page.name}{page.igUsername ? ` · @${page.igUsername}` : ''}</span></label>
                            {choice && <select aria-label={`Publish platforms for ${page.name}`} className={`${field} mt-2`} value={choice.platforms.join(',')}
                                onChange={e => setForm({ ...form, targets: form.targets.map(t => t.pageId === page.id ? { ...t, platforms: e.target.value.split(',') } : t) })}>
                                <option value="facebook">Facebook</option>{page.platforms.includes('instagram') && <><option value="instagram">Instagram</option><option value="facebook,instagram">Both</option></>}
                            </select>}</div>;
                    })}</div></div>
                <label className="text-sm">New post action<select className={`${field} mt-1`} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                    <option value="review">Import for review</option><option value="automatic">Queue automatically</option><option value="approval">Request WhatsApp approval</option></select></label>
                {form.mode === 'approval' && <label className="text-sm sm:col-span-2">Approver phone numbers<input className={`${field} mt-1`} value={form.approverPhones} placeholder="Country code and number, separated by commas" onChange={e => setForm({ ...form, approverPhones: e.target.value })} /></label>}
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                    <label className="text-xs text-[var(--muted)]">Checks per day<input type="number" min="1" max="12" className={`${field} mt-1`} value={form.checksPerDay} onChange={e => setForm({ ...form, checksPerDay: e.target.value })} /></label>
                    <label className="text-xs text-[var(--muted)]">Posts per check<input type="number" min="1" max="100" className={`${field} mt-1`} value={form.scrapeLimit} onChange={e => setForm({ ...form, scrapeLimit: e.target.value })} /></label>
                    <label className="text-xs text-[var(--muted)]">Minutes apart<input type="number" min="0" max="1440" className={`${field} mt-1`} value={form.gapMinutes} onChange={e => setForm({ ...form, gapMinutes: e.target.value })} /></label>
                </div>
                <div className="sm:col-span-2"><button disabled={!!busy || !form.targets.length} className={`${button} bg-[var(--accent)] text-white`}>{editingId ? 'Save watch' : 'Create watch'} <ArrowRight size={15} className="ml-1 inline" /></button>
                    {editingId && <button type="button" className={`${button} ml-2 border border-[var(--border)]`} onClick={() => { setEditingId(null); setForm(previous => ({ ...previous, sourceHandle: '', targets: [] })); }}>Cancel edit</button>}
                    {!pages.length && <span className="ml-3 text-sm text-[var(--muted)]">Connect a Meta Page in Social Profiles first.</span>}</div>
            </form>
        </section>

        {watches.length > 0 && <section className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <div className="space-y-2">{watches.map(w => <button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full rounded-xl border px-4 py-3 text-left ${selectedId === w.id ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                <span className="block font-semibold">@{w.source_handle}</span><span className="text-xs text-[var(--muted)]">{w.active ? 'Active' : 'Paused'} · {w.mode}</span></button>)}</div>
            <div className="min-w-0 space-y-4">
                {selected && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">@{selected.source_handle}</h2>
                        <p className="text-xs text-[var(--muted)]"><Clock3 size={12} className="mr-1 inline" />{selected.last_run_at ? `Last checked ${new Date(selected.last_run_at).toLocaleString()}` : 'First check not run'} · {selected.last_run_status || 'Ready'}</p></div>
                        <div className="flex gap-2"><button disabled={!!busy || !selected.active} className={`${button} bg-[var(--accent)] text-white`} onClick={() => act('run', `/watches/${selected.id}/run`)}><RefreshCw size={14} className="mr-1 inline" /> Run now</button>
                            <button className={`${button} border border-[var(--border)]`} onClick={() => { setEditingId(selected.id); setForm({ sourceHandle: selected.source_handle,
                                targets: selected.targets || [], mode: selected.mode, approverPhones: (selected.approver_phones || []).join(', '),
                                checksPerDay: selected.checks_per_day, scrapeLimit: selected.scrape_limit, gapMinutes: selected.gap_minutes });
                                window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                            <button disabled={!!busy} className={`${button} border border-[var(--border)]`} onClick={async () => { setBusy('pause'); try { await repostApi(workspaceId, `/watches/${selected.id}/active`, { method: 'PATCH', body: { active: !selected.active } }); await refresh(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } }}>
                                {selected.active ? <CirclePause size={14} className="mr-1 inline" /> : <CirclePlay size={14} className="mr-1 inline" />}{selected.active ? 'Pause' : 'Resume'}</button></div></div>
                    {selected.last_run_error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{selected.last_run_error}</p>}
                </div>}
                {posts.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">No imported posts yet. Run the first check to build your review list.</div>
                    : <div className="space-y-3">{posts.map(p => <article key={p.id} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        {p.media_urls?.[0] && <img src={p.media_urls[0]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><a href={p.permalink} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)]">{p.shortcode}</a>
                            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">{status(p)}</span></div>
                            <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{p.caption || 'No caption'}</p>
                            {(p.error_message || p.deliveries?.some(d => d.error_message)) && <p className="mt-1 text-xs text-red-600">{p.error_message || p.deliveries.find(d => d.error_message)?.error_message}</p>}
                            {p.deliveries?.length > 0 && <p className="mt-1 text-xs text-[var(--muted)]">{p.deliveries.map(d => `${d.page_name}: ${d.status}`).join(' · ')}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {['imported', 'queued'].includes(p.state) && (p.deliveries?.length || 0) < (selected?.targets?.length || 0) && <button disabled={!!busy} className={`${button} bg-[var(--accent)] text-white`} onClick={() => act(p.id, `/posts/${p.id}/queue`)}>{p.deliveries?.length ? 'Complete queue' : 'Queue post'}</button>}
                                {p.state === 'imported' && !p.deliveries?.length && <button disabled={!!busy} className={`${button} border border-[var(--border)]`} onClick={() => act(p.id, `/posts/${p.id}/skip`)}>Skip</button>}
                                {(p.state === 'media_failed' || p.deliveries?.some(d => d.status === 'failed')) && <button disabled={!!busy} className={`${button} border border-[var(--border)]`} onClick={() => act(p.id, `/posts/${p.id}/retry`)}>Retry</button>}
                                {p.deliveries?.some(d => ['pending', 'pending_approval'].includes(d.status)) && <button disabled={!!busy} className={`${button} border border-[var(--border)]`} onClick={() => act(p.id, `/posts/${p.id}/cancel`)}>Cancel</button>}
                            </div></div></article>)}</div>}
            </div>
        </section>}
        <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={14} /> Repost only content you own or have permission to use.</p>
    </div>;
}
