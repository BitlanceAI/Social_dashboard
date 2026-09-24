import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request, uploadBriefAttachment, getWorkspaceMembers } from '@/features/client-portal/lib/clientPortalApi';

const friendly = (value) => value.replaceAll('_', ' ');
const formClass = 'grid gap-4 border border-[var(--border)] bg-[var(--surface)] p-5';
const listClass = 'divide-y divide-[var(--border)] border-y border-[var(--border)]';

function Field({ label, children }) {
  return <label className="block"><span className="portal-label">{label}</span>{children}</label>;
}
function Notice({ error }) { return error ? <p role="alert" className="my-4 text-sm text-[var(--signup-error)]">{error}</p> : null; }

export function ClassificationSelectors({ workspaceId, campaignId, pillarId, onCampaign, onPillar, filtering = false }) {
  const [catalog, setCatalog] = useState({ campaigns: [], pillars: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([request('/api/campaigns', workspaceId), request('/api/pillars', workspaceId)])
      .then(([c, p]) => { if (active) setCatalog({ campaigns: c.items, pillars: p.items }); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [workspaceId]);
  return <><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Campaign"><select className="portal-input" value={campaignId || ''} onChange={e => onCampaign(e.target.value)}><option value="">{filtering ? 'All' : 'Unassigned'}</option>{catalog.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ` (${c.status})` : ''}</option>)}</select></Field>
    {onPillar && <Field label="Content pillar"><select className="portal-input" value={pillarId || ''} onChange={e => onPillar(e.target.value)}><option value="">{filtering ? 'All' : 'Unassigned'}</option>{catalog.pillars.filter(p => p.is_active || p.id === pillarId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
  </div><Notice error={error}/></>;
}

function BriefForm({ workspaceId, initial = {}, onSave, busy }) {
  const [form, setForm] = useState(() => ({ title: initial.title || '', objective: initial.objective || '', instructions: initial.instructions || '',
    due_at: initial.due_at?.slice(0, 10) || '', desired_publish_at: initial.desired_publish_at?.slice(0, 10) || '',
    campaign_id: initial.campaign_id || '', links: (initial.reference_urls || []).join('\n'), requested_channels: initial.requested_channels || [] }));
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  return <form className={formClass} onSubmit={e => { e.preventDefault(); const { links, ...body } = form; onSave({ ...body, reference_urls: links.split('\n').map(s => s.trim()).filter(Boolean), ...(initial.id ? { revision: initial.revision } : {}) }); }}>
    <h3 className="text-lg font-bold">{initial.id ? 'Update request' : 'What should we create?'}</h3>
    <Field label="Title"><input className="portal-input" value={form.title} onChange={set('title')} maxLength={160} required /></Field>
    <Field label="Goal"><input className="portal-input" value={form.objective} onChange={set('objective')} placeholder="Promote our October product launch" maxLength={10000}/></Field>
    <Field label="Instructions"><textarea className="portal-input min-h-28" value={form.instructions} onChange={set('instructions')} maxLength={10000}/></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Agency deadline (UTC date)"><input className="portal-input" type="date" value={form.due_at} onChange={set('due_at')}/></Field><Field label="Preferred publication (UTC date)"><input className="portal-input" type="date" value={form.desired_publish_at} onChange={set('desired_publish_at')}/></Field></div>
    <fieldset><legend className="portal-label">Requested channels</legend><div className="flex flex-wrap gap-4">{['facebook', 'instagram', 'linkedin'].map(channel => <label key={channel} className="flex gap-2 text-sm"><input type="checkbox" checked={form.requested_channels.includes(channel)} onChange={e => setForm(f => ({ ...f, requested_channels: e.target.checked ? [...f.requested_channels, channel] : f.requested_channels.filter(c => c !== channel) }))}/>{channel}</label>)}</div></fieldset>
    <ClassificationSelectors workspaceId={workspaceId} campaignId={form.campaign_id} onCampaign={campaign_id => setForm(f => ({ ...f, campaign_id }))}/>
    <Field label="Reference links (one per line)"><textarea className="portal-input" value={form.links} onChange={set('links')}/></Field>
    <button className="portal-button portal-button-primary justify-self-start" disabled={busy}>{busy ? 'Saving…' : initial.id ? 'Save request' : 'Submit request'}</button>
  </form>;
}

export function BriefsPanel({ workspaceId, role, userId, onCreateDraft, onOpenContent }) {
  const [items, setItems] = useState([]), [nextCursor, setCursor] = useState(null), [detail, setDetail] = useState(null);
  const [status, setStatus] = useState(''), [assignee, setAssignee] = useState(''), [members, setMembers] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [comment, setComment] = useState(''), [visibility, setVisibility] = useState('shared');
  const staff = role !== 'client';
  const load = useCallback(async (cursor = '') => {
    const params = new URLSearchParams({ status, assignedTo: assignee, campaignId, cursor });
    const data = await request(`/api/briefs?${params}`, workspaceId);
    setItems(old => cursor ? [...old, ...data.items] : data.items); setCursor(data.nextCursor);
  }, [workspaceId, status, assignee, campaignId]);
  useEffect(() => {
    const timer = setTimeout(() => { load().catch(e => setError(e.message)); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    let active = true;
    if (staff) getWorkspaceMembers(workspaceId).then(d => { if (active) setMembers(d.members.filter(m => m.role !== 'client')); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [workspaceId, staff]);
  const open = async id => { setDetail(await request(`/api/briefs/${id}`, workspaceId)); setEditing(false); };
  const run = async fn => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const update = body => run(async () => { await request(`/api/briefs/${detail.item.id}`, workspaceId, { method: 'PATCH', body: { revision: detail.item.revision, ...body } }); await open(detail.item.id); await load(); });
  const mayEdit = detail && (staff || (detail.item.created_by === userId && ['submitted','needs_info'].includes(detail.item.status)));
  return <section className="mt-8 space-y-6">
    <div className="flex items-center justify-between"><h2 className="text-2xl font-bold">Client requests</h2><button className="portal-button" onClick={() => { setCreating(!creating); setDetail(null); }}>New request</button></div>
    <Notice error={error}/>
    {creating && <BriefForm workspaceId={workspaceId} busy={busy} onSave={body => run(async () => { await request('/api/briefs', workspaceId, { method: 'POST', body }); setCreating(false); await load(); })}/>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><select className="portal-input" value={status} onChange={e => setStatus(e.target.value)}><option value="">All requests</option>{['submitted','needs_info','in_progress','completed','cancelled'].map(s => <option key={s} value={s}>{friendly(s)}</option>)}</select></Field>{staff && <Field label="Assignee"><select className="portal-input" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">All agency members</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.name || m.email || m.userId}</option>)}</select></Field>}</div>
    <ClassificationSelectors workspaceId={workspaceId} campaignId={campaignId} onCampaign={setCampaignId} filtering/>
    <div className={listClass}>{items.map(item => <button key={item.id} onClick={() => run(() => open(item.id))} className="flex w-full justify-between gap-4 py-4 text-left"><span><b>{item.title}</b><span className="block text-xs text-[var(--muted)]">{item.due_at ? `Due ${new Date(item.due_at).toLocaleDateString()}` : 'No deadline'}</span></span><span className="text-sm text-[var(--accent)]">{friendly(item.status)}</span></button>)}{!items.length && <p className="py-8 text-sm">No requests match these filters.</p>}</div>
    {nextCursor && <button className="portal-button" disabled={busy} onClick={() => run(() => load(nextCursor))}>Load more</button>}
    {detail && <article className="border border-[var(--border)] p-5 space-y-5">
      <div className="flex justify-between"><h3 className="text-xl font-bold">{detail.item.title}</h3><button className="portal-button" onClick={() => setDetail(null)}>Close</button></div>
      <p className="whitespace-pre-wrap">{detail.item.objective}</p><p className="whitespace-pre-wrap text-sm">{detail.item.instructions}</p>
      {(detail.item.reference_urls || []).map(url => <a className="block break-all text-sm underline" href={url} key={url} target="_blank" rel="noreferrer">{url}</a>)}
      {mayEdit && <button className="portal-button" onClick={() => setEditing(!editing)}>Edit request</button>}
      {editing && mayEdit && <BriefForm key={detail.item.revision} workspaceId={workspaceId} initial={detail.item} busy={busy} onSave={update}/>}
      {staff && <div className="grid gap-3 sm:grid-cols-2"><Field label="Status"><select className="portal-input" value={detail.item.status} disabled={busy || ['completed','cancelled'].includes(detail.item.status)} onChange={e => update({ status: e.target.value })}>{['submitted','needs_info','in_progress','completed','cancelled'].map(s => <option key={s} value={s}>{friendly(s)}</option>)}</select></Field><Field label="Assign to"><select className="portal-input" value={detail.item.assigned_to || ''} disabled={busy} onChange={e => update({ assigned_to: e.target.value })}><option value="">Unassigned</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.name || m.email || m.userId}</option>)}</select></Field></div>}
      {!staff && mayEdit && <button className="portal-button" disabled={busy} onClick={() => update({ status: 'cancelled' })}>Cancel request</button>}
      {staff && !['completed','cancelled'].includes(detail.item.status) && <button className="portal-button portal-button-primary" onClick={() => onCreateDraft(detail.item)}>Create draft from request</button>}
      <div><h4 className="font-bold">Linked content</h4>{detail.content.map(item => <button key={item.id} className="portal-button mt-2 mr-2" onClick={() => onOpenContent(item.id)}>{item.title} · {friendly(item.review_status)}</button>)}</div>
      <div className="space-y-2"><h4 className="font-bold">Attachments</h4>{detail.attachments.map(a => <button key={a.id} className="block underline text-sm" onClick={() => run(async () => { const d = await request(`/api/briefs/${detail.item.id}/attachments/${a.id}`, workspaceId); window.location.assign(d.url); })}>{a.filename} ({Math.ceil(a.size_bytes / 1024)} KB)</button>)}<Field label="Add a PDF, JPEG or PNG (10 MB each, 10 files maximum)"><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || detail.attachments.length >= 10} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) run(async () => { await uploadBriefAttachment(workspaceId, detail.item.id, file); await open(detail.item.id); }); }}/></Field></div>
      <section className="space-y-3"><h4 className="font-bold">Discussion</h4>{detail.comments.map(c => <div key={c.id} className="border-l-2 border-[var(--accent)] p-3 bg-[var(--surface)]"><small>{c.visibility === 'internal' ? 'Agency note' : 'Shared comment'} · {new Date(c.created_at).toLocaleString()}</small><p className="whitespace-pre-wrap text-sm mt-1">{c.body}</p></div>)}<form className="space-y-3" onSubmit={e => { e.preventDefault(); run(async () => { await request(`/api/briefs/${detail.item.id}/comments`, workspaceId, { method: 'POST', body: { body: comment, visibility } }); setComment(''); await open(detail.item.id); }); }}><Field label="Comment"><textarea className="portal-input" required maxLength={4000} value={comment} onChange={e => setComment(e.target.value)}/></Field>{staff && <Field label="Who can see this?"><select className="portal-input" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="shared">Client and agency</option><option value="internal">Agency only</option></select></Field>}<button className="portal-button" disabled={busy}>Add comment</button></form></section>
      <details><summary>Request history</summary>{detail.events.map(e => <p key={e.id} className="text-sm py-1">{friendly(e.action)} · {new Date(e.created_at).toLocaleString()}</p>)}</details>
    </article>}
  </section>;
}

export function CampaignsPanel({ workspaceId, role }) {
  const [progress, setProgress] = useState(null);
  const [campaigns, setCampaigns] = useState([]), [pillars, setPillars] = useState([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState(null);
  const load = useCallback(async () => { const [c,p] = await Promise.all([request('/api/campaigns',workspaceId),request('/api/pillars',workspaceId)]); setCampaigns(c.items);setPillars(p.items); },[workspaceId]);
  useEffect(() => { const timer=setTimeout(()=>load().catch(e=>setError(e.message)),0);return()=>clearTimeout(timer); },[load]);
  const save = async(e) => {
    e.preventDefault();setBusy(true);setError('');
    const form=new FormData(e.currentTarget), kind=editing.kind;
    const body=kind==='campaigns'?{name:form.get('name'),objective:form.get('description'),starts_at:form.get('starts_at') || null,ends_at:form.get('ends_at') || null,status:form.get('status')}:{name:form.get('name'),description:form.get('description'),color:form.get('color'),is_active:form.get('is_active')==='true'};
    try {await request(`/api/${kind}${editing.id?`/${editing.id}`:''}`,workspaceId,{method:editing.id?'PATCH':'POST',body});setEditing(null);await load();}
    catch(err){setError(err.message);}finally{setBusy(false);}
  };
  return <section className="mt-8 space-y-6"><h2 className="text-2xl font-bold">Campaigns & content pillars</h2><p className="text-sm text-[var(--muted)]">Group launches into campaigns and recurring themes into pillars. Apply them when creating a draft.</p><Notice error={error}/>
    {role!=='client' && <div className="flex gap-3"><button className="portal-button" onClick={()=>setEditing({kind:'campaigns'})}>New campaign</button><button className="portal-button" onClick={()=>setEditing({kind:'pillars'})}>New pillar</button></div>}
    {editing && <form key={`${editing.kind}-${editing.id || 'new'}`} onSubmit={save} className={formClass}><h3 className="font-bold">{editing.id?'Edit':'Create'} {editing.kind==='campaigns'?'campaign':'pillar'}</h3><Field label="Name"><input className="portal-input" name="name" defaultValue={editing.name} required maxLength={160}/></Field><Field label={editing.kind==='campaigns'?'Objective':'Description'}><textarea className="portal-input" name="description" defaultValue={editing.objective || editing.description} maxLength={4000}/></Field>{editing.kind==='campaigns'?<><div className="grid sm:grid-cols-2 gap-4"><Field label="Start date (UTC)"><input className="portal-input" type="date" name="starts_at" defaultValue={editing.starts_at?.slice(0,10)}/></Field><Field label="End date (UTC)"><input className="portal-input" type="date" name="ends_at" defaultValue={editing.ends_at?.slice(0,10)}/></Field></div><Field label="Status"><select className="portal-input" name="status" defaultValue={editing.status || 'active'}>{['active','completed','archived'].map(s=><option key={s}>{s}</option>)}</select></Field></>:<><Field label="Color"><input type="color" name="color" defaultValue={editing.color || '#1AA8A8'}/></Field><Field label="Availability"><select className="portal-input" name="is_active" defaultValue={String(editing.is_active ?? true)}><option value="true">Active</option><option value="false">Inactive</option></select></Field></>}<div className="flex gap-3"><button className="portal-button portal-button-primary" disabled={busy}>Save</button><button type="button" className="portal-button" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
    {progress && <article className={formClass}><h3 className="font-bold">{progress.name} — content progress</h3><div className="flex flex-wrap gap-4">{Object.entries(progress.progress).map(([status,count])=><p key={status}>{friendly(status)}: <b>{count}</b></p>)}</div><button className="portal-button justify-self-start" onClick={()=>setProgress(null)}>Close</button></article>}
    {[['campaigns',campaigns],['pillars',pillars]].map(([kind,rows])=><div key={kind}><h3 className="font-bold mb-3">{kind==='campaigns'?'Campaigns':'Pillars'}</h3><div className={listClass}>{rows.map(row=><div key={row.id} className="flex justify-between gap-3 py-4"><div><b>{row.name}</b><p className="text-sm text-[var(--muted)]">{row.objective || row.description}</p><small>{row.status || (row.is_active?'Active':'Inactive')}</small></div><div className="flex gap-2">{kind==='campaigns' && <button className="portal-button" onClick={async()=>{try{setProgress({name:row.name,...await request(`/api/campaigns/${row.id}/posts`,workspaceId)});}catch(e){setError(e.message);}}}>Progress</button>}{role!=='client' && <button className="portal-button" onClick={()=>setEditing({...row,kind})}>Edit</button>}</div></div>)}{!rows.length && <p className="py-4 text-sm">None created yet.</p>}</div></div>)}
  </section>;
}

export function ReportAutomationPanel({ workspaceId, role }) {
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[nextOffset,setOffset]=useState(null);
  const [schedule,setSchedule]=useState({enabled:false,day_of_month:1,timezone:'Asia/Kolkata',narrative:''});
  const [month,setMonth]=useState(()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
  const manager=['owner','admin'].includes(role);
  const load=useCallback(async(offset=0)=>{const d=await request(`/api/reports/snapshots?offset=${offset}`,workspaceId);setRows(old=>offset?[...old,...d.items]:d.items);setOffset(d.nextOffset);},[workspaceId]);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{load().catch(e=>{if(active)setError(e.message);});if(manager)request('/api/reports/schedule',workspaceId).then(d=>{if(active&&d.schedule)setSchedule(d.schedule);}).catch(e=>{if(active)setError(e.message);});},0);return()=>{active=false;clearTimeout(timer);};},[load,manager,workspaceId]);
  useEffect(()=>{if(!rows.some(r=>['queued','processing'].includes(r.status)))return;const timer=setInterval(()=>load().catch(e=>setError(e.message)),10000);return()=>clearInterval(timer);},[rows,load]);
  const run=async fn=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const metricValue=value=>value===null?'Unavailable':value;
  return <section className="mt-10 border-t border-[var(--border)] pt-8 space-y-5"><div className="flex justify-between"><h2 className="text-2xl font-bold">Monthly report archive</h2><button className="portal-button" onClick={()=>run(()=>load())} disabled={busy}>Refresh</button></div><p className="text-sm text-[var(--muted)]">Reports collect delivery totals, available engagement, campaign results and agency notes. PDFs are available once generation finishes.</p><Notice error={error}/>
    {manager && <><form className={formClass} onSubmit={e=>{e.preventDefault();run(async()=>{await request('/api/reports/schedule',workspaceId,{method:'PUT',body:schedule});});}}><h3 className="font-bold">Monthly automation</h3><label className="flex gap-2"><input type="checkbox" checked={schedule.enabled} onChange={e=>setSchedule(s=>({...s,enabled:e.target.checked}))}/>Generate the previous month automatically</label><div className="grid gap-4 sm:grid-cols-2"><Field label="Day of month (1–28)"><input className="portal-input" type="number" min={1} max={28} value={schedule.day_of_month} onChange={e=>setSchedule(s=>({...s,day_of_month:Number(e.target.value)}))}/></Field><Field label="Timezone"><input className="portal-input" value={schedule.timezone} onChange={e=>setSchedule(s=>({...s,timezone:e.target.value}))} required/></Field></div><Field label="Agency notes included in future reports"><textarea className="portal-input" maxLength={10000} value={schedule.narrative} onChange={e=>setSchedule(s=>({...s,narrative:e.target.value}))}/></Field><button className="portal-button justify-self-start" disabled={busy}>Save schedule</button><p className="text-xs text-[var(--muted)]">Delivery: client portal and PDF download. Email delivery is not configured.</p></form><form className="flex flex-wrap gap-3 items-end" onSubmit={e=>{e.preventDefault();run(async()=>{const d=await request('/api/reports/snapshots/generate',workspaceId,{method:'POST',body:{month,timezone:schedule.timezone,narrative:schedule.narrative}});await load();if(d.item.status==='ready')setSelected((await request(`/api/reports/snapshots/${d.item.id}`,workspaceId)).item);});}}><Field label="Report month"><input className="portal-input" type="month" value={month} onChange={e=>setMonth(e.target.value)} required/></Field><button className="portal-button portal-button-primary" disabled={busy}>Generate report</button></form></>}
    <div className={listClass}>{rows.map(row=><div key={row.id} className="flex flex-wrap gap-3 justify-between py-4"><div><b>{row.month}</b><p className="text-xs text-[var(--muted)]">{row.status} · {row.timezone}</p>{row.error_message && <p role="status" className="text-sm">{row.error_message}</p>}</div><div className="flex gap-2">{row.status==='ready' && <><button className="portal-button" onClick={()=>run(async()=>setSelected((await request(`/api/reports/snapshots/${row.id}`,workspaceId)).item))}>View</button><button className="portal-button" onClick={()=>run(async()=>{const d=await request(`/api/reports/snapshots/${row.id}/download`,workspaceId);window.location.assign(d.url);})}>Download PDF</button></>}{row.status==='failed' && manager && <button className="portal-button" onClick={()=>run(async()=>{await request(`/api/reports/snapshots/${row.id}/retry`,workspaceId,{method:'POST',body:{}});await load();})}>Retry</button>}</div></div>)}{!rows.length && <p className="py-5 text-sm">No monthly reports generated yet.</p>}</div>
    {nextOffset!==null && <button className="portal-button" onClick={()=>run(()=>load(nextOffset))}>Load more</button>}
    {selected?.metrics && <article className="space-y-5 bg-[var(--surface)] p-5"><div className="flex justify-between"><h3 className="text-xl font-bold">{selected.brand_snapshot?.client_name} · {selected.month}</h3><button className="portal-button" onClick={()=>setSelected(null)}>Close</button></div><div className="flex flex-wrap gap-6">{Object.entries(selected.metrics.totals).map(([k,v])=><p key={k}><b>{v}</b> {friendly(k)}</p>)}</div><h4 className="font-bold">Engagement</h4><div className="flex flex-wrap gap-6">{Object.entries(selected.metrics.engagement).map(([k,v])=><p key={k}>{k}: <b>{metricValue(v)}</b></p>)}</div><p className="text-sm">Metrics available for {selected.metrics.coverage.withMetrics} of {selected.metrics.coverage.published} published posts.</p>{['campaigns','pillars'].map(group=><div key={group}><h4 className="font-bold capitalize">{group}</h4>{selected.metrics[group].map(r=><p key={r.id} className="text-sm py-2">{r.name}: {r.published}/{r.total} published; {r.failed} failed; engagement {metricValue(r.engagement)}</p>)}</div>)}<h4 className="font-bold">Top posts</h4>{selected.metrics.topPosts.map(p=><p key={p.id} className="text-sm">{p.pageName} · {p.score} engagements<br/>{p.caption}</p>)}<p className="whitespace-pre-wrap">{selected.narrative}</p>{selected.metrics.notes.map(note=><p key={note} className="text-xs text-[var(--muted)]">{note}</p>)}<p className="text-sm">{selected.brand_snapshot?.report_footer}</p></article>}
    <Link className="text-xs underline" to="/portal">Back to portal</Link>
  </section>;
}
