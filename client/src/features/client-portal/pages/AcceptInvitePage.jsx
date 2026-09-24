import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Logo from '@/shared/components/layout/Logo';
import { acceptWorkspaceInvite, previewWorkspaceInvite } from '@/features/client-portal/lib/clientPortalApi';

export default function AcceptInvitePage() {
  const { token } = useParams(); const navigate = useNavigate();
  const [invite, setInvite] = useState(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => previewWorkspaceInvite(token).then((data) => setInvite(data.invite)).catch((err) => setError(err.message)), 0);
    return () => clearTimeout(timer);
  }, [token]);
  const accept = async () => {
    setBusy(true); setError('');
    try { await acceptWorkspaceInvite(token); navigate('/portal', { replace: true }); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return <main className="grid min-h-screen place-items-center bg-[var(--bg)] p-5 text-[var(--text)]">
    <section className="w-full max-w-xl border border-[var(--border)] bg-[var(--surface)] p-8 sm:p-12">
      <Logo className="h-8" />
      <div className="mt-12 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Workspace invitation</div>
      {!invite && !error && <div className="mt-8 flex items-center gap-3 text-sm text-[var(--muted)]"><Loader2 size={18} className="animate-spin"/>Checking your invitation…</div>}
      {error && <><h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">This invitation cannot be used.</h1><p className="mt-4 text-sm leading-6 text-red-500">{error}</p><Link to="/" className="portal-button mt-8">Return home</Link></>}
      {invite && <><CheckCircle2 className="mt-8 text-[var(--accent)]" size={34}/><h1 className="mt-4 text-4xl font-black leading-tight tracking-[-0.05em]">Join {invite.workspaceName}</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)]">You were invited as a <b className="text-[var(--text)]">{invite.role}</b>. The portal will give you access to content reviews and reporting for this workspace.</p><button className="portal-button portal-button-primary mt-8" onClick={accept} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin"/> : <ArrowRight size={16}/>}Accept and open portal</button></>}
    </section>
  </main>;
}

