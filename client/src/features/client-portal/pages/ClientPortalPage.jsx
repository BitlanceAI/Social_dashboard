import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, ChevronRight,
  Clock3, FileText, Loader2, MessageSquare, Plus, RefreshCw, Send, Settings2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useWorkspace } from '@/features/workspace';
import Logo from '@/shared/components/layout/Logo';
import {
  addContentComment, contentAction, createContentItem, createContentVersion,
  getBrand, getCalendar, getContentItem, getReport, getWorkspaceInvites,
  getWorkspaceMembers, getConnectedDestinations, inviteClient, saveBrand,
} from '@/features/client-portal/lib/clientPortalApi';

const STATUS = {
  draft: ['Draft', '#6B7280'], internal_review: ['Internal review', '#D97706'],
  client_review: ['Awaiting approval', '#7C3AED'], changes_requested: ['Changes requested', '#E05252'],
  approved: ['Approved', '#0F9494'], scheduled: ['Scheduled', '#2563EB'],
  published: ['Published', '#16845B'], failed: ['Failed', '#DC2626'], cancelled: ['Cancelled', '#6B7280'],
};

const monthRange = (date) => ({
  from: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(),
  to: new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString(),
});
const dayKey = (value) => value ? new Date(value).toLocaleDateString('en-CA') : 'unscheduled';
const niceDay = (key) => key === 'unscheduled' ? 'Unscheduled' : new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function StatusBadge({ status }) {
  const [label, color] = STATUS[status] || [status, '#6B7280'];
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}

function Metric({ label, value, tone = 'var(--text)' }) {
  return <div className="border-l border-[var(--border)] pl-4"><div className="text-3xl font-black tracking-[-0.05em]" style={{ color: tone }}>{value}</div><div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div></div>;
}

function NewContentForm({ onClose, onSave, workspaceId }) {
  const [form, setForm] = useState(() => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setMinutes(0, 0, 0);
    return { title: '', caption: '', destinationIndex: '', plannedFor: tomorrow.toISOString().slice(0, 16) };
  });
  const [saving, setSaving] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [destinationError, setDestinationError] = useState('');
  useEffect(() => {
    let active = true;
    getConnectedDestinations(workspaceId).then((items) => {
      if (active) setDestinations(items);
    }).catch((error) => {
      if (active) setDestinationError(error.message);
    }).finally(() => {
      if (active) setLoadingDestinations(false);
    });
    return () => { active = false; };
  }, [workspaceId]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    const selected = destinations[Number(form.destinationIndex)];
    if (!selected) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title, caption: form.caption, provider: selected.provider,
        plannedFor: new Date(form.plannedFor).toISOString(),
        destination: selected.provider === 'meta'
          ? { pageId: selected.id, pageName: selected.name, platforms: selected.platforms }
          : { actorId: selected.id, actorName: selected.name, platforms: selected.platforms },
      });
      onClose();
    } finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="space-y-5">
    <div><label className="portal-label">Working title</label><input className="portal-input" value={form.title} onChange={set('title')} placeholder="October product story" required /></div>
    <div><label className="portal-label">Caption</label><textarea className="portal-input min-h-36 resize-y" value={form.caption} onChange={set('caption')} placeholder="Write the post clients will review…" required /></div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="portal-label" htmlFor="portal-destination">Connected account</label><select id="portal-destination" className="portal-input" value={form.destinationIndex} onChange={set('destinationIndex')} required disabled={loadingDestinations || !destinations.length}><option value="">{loadingDestinations ? 'Loading accounts…' : 'Select an account'}</option>{destinations.map((destination, index) => <option key={`${destination.provider}-${destination.id}-${destination.type}`} value={index}>{destination.name} · {destination.type} · {destination.id}</option>)}</select></div>
      <div><label className="portal-label">Planned time</label><input className="portal-input" type="datetime-local" value={form.plannedFor} onChange={set('plannedFor')} required /></div>
    </div>
    {destinationError && <p role="alert" className="text-sm text-red-500">Could not load connected accounts: {destinationError}</p>}
    {!loadingDestinations && !destinationError && !destinations.length && <p className="text-sm text-[var(--muted)]">Connect and select a Facebook Page or LinkedIn profile in Social Profiles first.</p>}
    {form.destinationIndex !== '' && <p className="text-xs text-[var(--muted)]">Connected ID: {destinations[Number(form.destinationIndex)]?.id}</p>}
    <div className="flex justify-end gap-3 pt-2"><button type="button" className="portal-button" onClick={onClose}>Cancel</button><button className="portal-button portal-button-primary" disabled={saving || loadingDestinations || !destinations.length}>{saving && <Loader2 size={15} className="animate-spin" />}Create draft</button></div>
  </form>;
}

function ContentDrawer({ id, workspaceId, role, onClose, onChanged }) {
  const [item, setItem] = useState(null); const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState(''); const [reason, setReason] = useState('');
  const [caption, setCaption] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await getContentItem(workspaceId, id); setItem(data.item); setCaption(data.item.current_version?.caption || ''); }
    catch (error) { toast.error(error.message); onClose(); }
    finally { setLoading(false); }
  }, [id, workspaceId, onClose]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const act = async (action, body = {}) => {
    setBusy(action);
    try { await contentAction(workspaceId, id, action, body); toast.success('Content updated'); await load(); onChanged(); }
    catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const saveComment = async (event) => {
    event.preventDefault(); if (!comment.trim()) return;
    setBusy('comment'); try { await addContentComment(workspaceId, id, { body: comment }); setComment(''); await load(); }
    catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const revise = async () => {
    setBusy('revise'); try { await createContentVersion(workspaceId, id, { caption, mediaUrls: item.current_version?.media_urls || [], linkUrl: item.current_version?.link_url }); toast.success('New version created'); await load(); onChanged(); }
    catch (error) { toast.error(error.message); } finally { setBusy(''); }
  };
  const agency = role !== 'client';
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--bg)] shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-4 backdrop-blur"><div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Content review</div><button className="portal-icon" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
      {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div> : item && <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4"><div><StatusBadge status={item.review_status} /><h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">{item.title}</h1><p className="mt-2 text-sm text-[var(--muted)]">{item.destination?.pageName || item.destination?.actorName || 'Publishing destination'} · {item.planned_for ? new Date(item.planned_for).toLocaleString('en-IN') : 'No date'}</p></div><div className="text-right text-xs text-[var(--muted)]">VERSION<br/><b className="text-xl text-[var(--text)]">{item.current_version?.version_number}</b></div></div>
        <section className="mt-8 border-y border-[var(--border)] py-7"><div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Post copy</div>{agency && ['draft', 'changes_requested'].includes(item.review_status) ? <><textarea className="portal-input min-h-48 resize-y text-base leading-7" value={caption} onChange={(e) => setCaption(e.target.value)} /><button className="portal-button mt-3" onClick={revise} disabled={busy}>Save as new version</button></> : <p className="whitespace-pre-wrap text-[15px] leading-7">{item.current_version?.caption}</p>}</section>
        <div className="mt-6 flex flex-wrap gap-3">
          {agency && ['draft', 'internal_review', 'changes_requested'].includes(item.review_status) && <button className="portal-button portal-button-primary" onClick={() => act('submit-client')} disabled={busy}><Send size={15}/>Send to client</button>}
          {['client', 'owner', 'admin'].includes(role) && item.review_status === 'client_review' && <button className="portal-button portal-button-primary" onClick={() => act('approve')} disabled={busy}><Check size={16}/>Approve version</button>}
          {['client', 'owner', 'admin'].includes(role) && ['client_review', 'approved'].includes(item.review_status) && <div className="flex w-full gap-2 sm:w-auto"><input className="portal-input min-w-0" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change?" /><button className="portal-button" onClick={() => act('request-changes', { reason })} disabled={!reason.trim() || busy}>Request changes</button></div>}
          {agency && item.review_status === 'approved' && <button className="portal-button portal-button-primary" onClick={() => act('schedule')} disabled={busy}><Clock3 size={15}/>Schedule approved post</button>}
        </div>
        <section className="mt-10"><div className="flex items-center gap-2 text-sm font-bold"><MessageSquare size={16}/>Conversation <span className="text-[var(--muted)]">{item.comments.length}</span></div><div className="mt-4 space-y-3">{item.comments.map((entry) => <article key={entry.id} className="border-l-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3"><div className="text-xs font-bold">{entry.author?.name || entry.author?.email || 'Workspace member'} <span className="font-normal text-[var(--muted)]">· {new Date(entry.created_at).toLocaleString('en-IN')}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.body}</p></article>)}</div><form onSubmit={saveComment} className="mt-4 flex gap-2"><input className="portal-input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add feedback or reply…" /><button className="portal-icon shrink-0" aria-label="Send comment" disabled={busy === 'comment'}><Send size={17}/></button></form></section>
        <section className="mt-10"><div className="text-sm font-bold">Activity</div><ol className="mt-4 space-y-3 border-l border-[var(--border)] pl-5">{item.activity.map((entry) => <li key={entry.id} className="relative text-sm"><i className="absolute -left-[23px] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"/><b>{entry.action.replaceAll('_', ' ')}</b>{entry.reason && <p className="mt-1 text-[var(--muted)]">{entry.reason}</p>}<time className="text-xs text-[var(--muted)]">{new Date(entry.created_at).toLocaleString('en-IN')}</time></li>)}</ol></section>
      </div>}
    </aside>
  </div>;
}

function PortalSettings({ workspaceId, brand, onBrandChanged }) {
  const [members, setMembers] = useState([]); const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState(''); const [inviteLink, setInviteLink] = useState('');
  const [form, setForm] = useState(() => ({
    clientName: brand?.client_name || '', primaryColor: brand?.primary_color || '#1AA8A8',
    secondaryColor: brand?.secondary_color || '#0A0A0A', toneOfVoice: brand?.tone_of_voice || '', reportFooter: brand?.report_footer || '',
  }));
  const [busy, setBusy] = useState(false);
  const loadPeople = useCallback(async () => {
    try { const [memberData, inviteData] = await Promise.all([getWorkspaceMembers(workspaceId), getWorkspaceInvites(workspaceId)]); setMembers(memberData.members || []); setInvites(inviteData.invites || []); }
    catch (error) { toast.error(error.message); }
  }, [workspaceId]);
  useEffect(() => { const timer = setTimeout(loadPeople, 0); return () => clearTimeout(timer); }, [loadPeople]);
  const submitInvite = async (event) => {
    event.preventDefault(); setBusy(true);
    try { const data = await inviteClient(workspaceId, email); setInviteLink(data.acceptUrl); setEmail(''); toast.success('Client invitation created'); await loadPeople(); }
    catch (error) { toast.error(error.message); } finally { setBusy(false); }
  };
  const submitBrand = async (event) => {
    event.preventDefault(); setBusy(true);
    try { const data = await saveBrand(workspaceId, form); onBrandChanged(data.brand); toast.success('Client identity saved'); }
    catch (error) { toast.error(error.message); } finally { setBusy(false); }
  };
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <div className="mt-10 grid gap-10 xl:grid-cols-2">
    <section><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Client access</div><h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">Invite reviewers</h3><form onSubmit={submitInvite} className="mt-6 flex gap-2"><input type="email" className="portal-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" required/><button className="portal-button portal-button-primary shrink-0" disabled={busy}><Plus size={15}/>Invite client</button></form>{inviteLink && <div className="mt-3 border-l-2 border-[var(--accent)] bg-[var(--surface)] p-3 text-xs"><div className="font-bold">Share this one-time link</div><div className="mt-1 break-all text-[var(--muted)]">{inviteLink}</div></div>}<div className="mt-8 border-t border-[var(--border)]">{members.map((person) => <div key={person.userId} className="flex items-center justify-between border-b border-[var(--border)] py-3 text-sm"><div><b>{person.name || person.email}</b><div className="text-xs text-[var(--muted)]">{person.email}</div></div><span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--muted)]">{person.role}</span></div>)}{invites.map((invite) => <div key={invite.id} className="flex items-center justify-between border-b border-[var(--border)] py-3 text-sm"><div>{invite.email}<div className="text-xs text-[var(--muted)]">Invitation pending</div></div><span className="text-[10px] font-bold uppercase tracking-[0.13em] text-amber-600">{invite.role}</span></div>)}</div></section>
    <section><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Portal identity</div><h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">Make it theirs</h3><form onSubmit={submitBrand} className="mt-6 space-y-5"><div><label className="portal-label">Client name</label><input className="portal-input" value={form.clientName} onChange={set('clientName')} placeholder="Acme Studio"/></div><div className="grid grid-cols-2 gap-4"><div><label className="portal-label">Primary color</label><input type="color" className="portal-input h-12 p-1" value={form.primaryColor} onChange={set('primaryColor')}/></div><div><label className="portal-label">Secondary color</label><input type="color" className="portal-input h-12 p-1" value={form.secondaryColor} onChange={set('secondaryColor')}/></div></div><div><label className="portal-label">Tone of voice</label><textarea className="portal-input min-h-28" value={form.toneOfVoice} onChange={set('toneOfVoice')} placeholder="Direct, optimistic and evidence-led…"/></div><div><label className="portal-label">Report footer</label><input className="portal-input" value={form.reportFooter} onChange={set('reportFooter')} placeholder="Prepared by your agency"/></div><button className="portal-button portal-button-primary" disabled={busy}>Save client identity</button></form></section>
  </div>;
}

export default function ClientPortalPage() {
  const { activeWorkspace, activeWorkspaceId, workspaces, switchWorkspace, loading: workspaceLoading } = useWorkspace();
  const [month, setMonth] = useState(() => new Date()); const [items, setItems] = useState([]);
  const [report, setReport] = useState(null); const [brand, setBrand] = useState(null);
  const [tab, setTab] = useState('calendar'); const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); const [creating, setCreating] = useState(false);
  const range = useMemo(() => monthRange(month), [month]); const role = activeWorkspace?.role;
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const [calendar, reportData, brandData] = await Promise.all([getCalendar(activeWorkspaceId, range.from, range.to), getReport(activeWorkspaceId, range.from, range.to), getBrand(activeWorkspaceId)]);
      setItems(calendar.items); setReport(reportData); setBrand(brandData.brand);
    } catch (error) { toast.error(error.message); } finally { setLoading(false); }
  }, [activeWorkspaceId, range.from, range.to]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const groups = useMemo(() => Object.entries(items.reduce((acc, item) => { const key = dayKey(item.planned_for); (acc[key] ||= []).push(item); return acc; }, {})), [items]);
  const moveMonth = (step) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  const saveNew = async (payload) => { await createContentItem(activeWorkspaceId, payload); toast.success('Draft created'); await load(); };
  if (workspaceLoading || !activeWorkspace) return <div className="grid min-h-screen place-items-center bg-[var(--bg)]"><Loader2 className="animate-spin text-[var(--accent)]"/></div>;
  return <div className="portal-page min-h-screen bg-[var(--bg)] text-[var(--text)]">
    <header className="border-b border-[var(--border)]"><div className="mx-auto flex max-w-[1480px] items-center gap-5 px-5 py-4 lg:px-10"><Logo/><span className="hidden h-5 w-px bg-[var(--border)] sm:block"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{brand?.client_name || activeWorkspace.name}</div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{role === 'client' ? 'Client review room' : 'Agency operations desk'}</div></div><select className="portal-input hidden max-w-52 sm:block" value={activeWorkspaceId} onChange={(e) => switchWorkspace(e.target.value)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div></header>
    <main className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-12">
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside><div className="sticky top-8"><div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Workspace</div><h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.055em]">Content<br/>control room.</h1><nav className="mt-10 space-y-1"><button className={`portal-nav ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}><CalendarDays size={17}/>Calendar</button><button className={`portal-nav ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}><BarChart3 size={17}/>Reports</button>{role !== 'client' && <button className={`portal-nav ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><Settings2 size={17}/>Clients & brand</button>}</nav><div className="mt-10 border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--muted)]">One clear thread from first draft to published result.</div></div></aside>
        <section className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">{tab === 'calendar' ? 'Editorial schedule' : tab === 'reports' ? 'Delivery report' : 'Workspace setup'}</div><h2 className="mt-2 text-3xl font-black tracking-[-0.045em]">{tab === 'settings' ? 'Clients & brand' : month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2></div>{tab !== 'settings' && <div className="flex items-center gap-2"><button className="portal-icon" onClick={() => moveMonth(-1)} aria-label="Previous month"><ArrowLeft size={17}/></button><button className="portal-icon" onClick={() => moveMonth(1)} aria-label="Next month"><ArrowRight size={17}/></button><button className="portal-icon" onClick={load} aria-label="Refresh"><RefreshCw size={16}/></button>{role !== 'client' && tab === 'calendar' && <button className="portal-button portal-button-primary ml-2" onClick={() => setCreating(true)}><Plus size={16}/>New content</button>}</div>}</div>
          {loading ? <div className="grid h-80 place-items-center"><Loader2 className="animate-spin text-[var(--accent)]"/></div> : tab === 'calendar' ? <div className="mt-8 border-t border-[var(--border)]">{groups.length ? groups.map(([day, dayItems]) => <div key={day} className="grid border-b border-[var(--border)] py-5 md:grid-cols-[150px_1fr]"><div className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)] md:mb-0">{niceDay(day)}</div><div className="space-y-2">{dayItems.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className="group grid w-full grid-cols-[7px_1fr_auto] items-center gap-4 border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]"><i className="h-full min-h-12 rounded-full" style={{ background: STATUS[item.review_status]?.[1] }}/><div className="min-w-0"><div className="truncate font-bold">{item.title}</div><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]"><span>{item.destination?.pageName || item.destination?.actorName || item.provider}</span><StatusBadge status={item.review_status}/></div></div><ChevronRight size={18} className="text-[var(--muted)] transition group-hover:translate-x-1 group-hover:text-[var(--accent)]"/></button>)}</div></div>) : <div className="grid min-h-80 place-items-center border-b border-[var(--border)] text-center"><div><CalendarDays className="mx-auto text-[var(--muted)]"/><h3 className="mt-4 font-bold">Nothing planned this month</h3><p className="mt-1 text-sm text-[var(--muted)]">Move to another month or create the first content item.</p></div></div>}</div> : tab === 'reports' ? <div className="mt-10"><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4"><Metric label="All posts" value={report?.totals?.total || 0}/><Metric label="Published" value={report?.totals?.published || 0} tone="#16845B"/><Metric label="Scheduled" value={(report?.totals?.scheduled || 0) + (report?.totals?.pending || 0)} tone="#2563EB"/><Metric label="Failed" value={report?.totals?.failed || 0} tone="#DC2626"/></div><div className="mt-12 border-t border-[var(--border)]"><div className="py-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Recent delivery</div>{report?.recentPosts?.map((post) => <div key={post.id} className="grid gap-2 border-t border-[var(--border)] py-4 sm:grid-cols-[120px_1fr_120px]"><StatusBadge status={post.status}/><div className="truncate text-sm">{post.content}</div><time className="text-xs text-[var(--muted)]">{new Date(post.scheduled_time).toLocaleDateString('en-IN')}</time></div>)}</div><button className="portal-button mt-8" onClick={() => window.print()}><FileText size={15}/>Print / Save PDF</button></div> : <PortalSettings workspaceId={activeWorkspaceId} brand={brand} onBrandChanged={setBrand}/>} 
        </section>
      </div>
    </main>
    {selected && <ContentDrawer id={selected} workspaceId={activeWorkspaceId} role={role} onClose={() => setSelected(null)} onChanged={load}/>} 
    {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}><div className="w-full max-w-2xl bg-[var(--bg)] p-6 shadow-2xl sm:p-8"><div className="mb-7 flex items-center justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">New editorial item</div><h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Start with the idea.</h2></div><button className="portal-icon" onClick={() => setCreating(false)}><X size={18}/></button></div><NewContentForm workspaceId={activeWorkspaceId} onClose={() => setCreating(false)} onSave={saveNew}/></div></div>}
  </div>;
}
