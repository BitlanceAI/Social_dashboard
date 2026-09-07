import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAdminPlans, updateAdminPlan, fetchAdminSubscriptions } from '../lib/adminApi';
import StatusChip from './StatusChip';

const inputClass =
    'w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors';

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const SUB_STATUS = { active: 'active', trialing: 'active', past_due: 'token-expiring', halted: 'token-expired', cancelled: 'no-connection' };

/** Admin Plans tab: edit tier pricing/limits/Razorpay ids; view subscriptions. */
const PlansPanel = () => {
    const [plans, setPlans] = useState([]);
    const [subs, setSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState(null);
    const [edits, setEdits] = useState({}); // planKey -> partial patch

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [p, s] = await Promise.all([fetchAdminPlans(), fetchAdminSubscriptions()]);
            setPlans(p.plans);
            setSubs(s.subscriptions);
            setEdits({});
        } catch (err) {
            toast.error(err.message || 'Could not load plans');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

    const setField = (key, field, value) =>
        setEdits((e) => ({ ...e, [key]: { ...e[key], [field]: value } }));

    const save = async (plan) => {
        const patch = edits[plan.plan_key];
        if (!patch) return;
        setSavingKey(plan.plan_key);
        try {
            // Rupee inputs → paise for the price fields.
            const body = { ...patch };
            if (body.monthly_rupees !== undefined) { body.monthly_price = Math.round(parseFloat(body.monthly_rupees) * 100); delete body.monthly_rupees; }
            if (body.yearly_rupees !== undefined) { body.yearly_price = Math.round(parseFloat(body.yearly_rupees) * 100); delete body.yearly_rupees; }
            await updateAdminPlan(plan.plan_key, body);
            toast.success(`${plan.name} saved`);
            load();
        } catch (err) {
            toast.error(err.message || 'Could not save');
        } finally {
            setSavingKey(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center">
                <p className="flex-1 text-[11px] font-mono text-[var(--muted)]">
                    Prices in ₹ (stored as paise). Blank limit = unlimited. Razorpay Plan ids must be created in
                    Razorpay before a tier can be checked out.
                </p>
                <button onClick={load} className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Plan editors */}
            <div className="grid lg:grid-cols-3 gap-4">
                {plans.map((p) => {
                    return (
                        <div key={p.plan_key} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="flex-1 font-['Space_Grotesk'] font-bold">{p.name}</h3>
                                {p.highlighted && <StatusChip status="active" label="featured" />}
                                {!p.is_active && <StatusChip status="no-connection" label="hidden" />}
                            </div>
                            <div className="space-y-3">
                                <label className="block">
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">₹ / month</span>
                                    <input type="number" min="0" step="1" className={inputClass}
                                        defaultValue={p.monthly_price / 100}
                                        onChange={(ev) => setField(p.plan_key, 'monthly_rupees', ev.target.value)} />
                                </label>
                                <label className="block">
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">₹ / year</span>
                                    <input type="number" min="0" step="1" className={inputClass}
                                        defaultValue={p.yearly_price / 100}
                                        onChange={(ev) => setField(p.plan_key, 'yearly_rupees', ev.target.value)} />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[['included_accounts', 'Accounts'], ['included_users', 'Users'], ['included_workspaces', 'Workspaces'], ['daily_post_limit', 'Daily posts']].map(([f, label]) => (
                                        <label key={f} className="block">
                                            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">{label}</span>
                                            <input type="number" min="0" className={inputClass} placeholder="∞"
                                                defaultValue={p[f] ?? ''}
                                                onChange={(ev) => setField(p.plan_key, f, ev.target.value === '' ? null : parseInt(ev.target.value, 10))} />
                                        </label>
                                    ))}
                                </div>
                                <label className="block">
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Razorpay plan id · monthly</span>
                                    <input className={inputClass} placeholder="plan_..." defaultValue={p.razorpay_plan_id_monthly || ''}
                                        onChange={(ev) => setField(p.plan_key, 'razorpay_plan_id_monthly', ev.target.value)} />
                                </label>
                                <label className="block">
                                    <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">Razorpay plan id · yearly</span>
                                    <input className={inputClass} placeholder="plan_..." defaultValue={p.razorpay_plan_id_yearly || ''}
                                        onChange={(ev) => setField(p.plan_key, 'razorpay_plan_id_yearly', ev.target.value)} />
                                </label>
                                <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                                    <input type="checkbox" defaultChecked={p.is_active}
                                        onChange={(ev) => setField(p.plan_key, 'is_active', ev.target.checked)} />
                                    Visible on pricing page
                                </label>
                            </div>
                            <button
                                onClick={() => save(p)}
                                disabled={savingKey === p.plan_key || !edits[p.plan_key]}
                                className="btn-primary w-full rounded-xl py-2 text-sm mt-4 disabled:opacity-50"
                            >
                                {savingKey === p.plan_key ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Subscriptions */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <h2 className="text-[15px] font-semibold px-5 pt-5 pb-3">Subscriptions</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Plan', 'Interval', 'Renews / trial ends', 'Status'].map((h) => (
                                    <th key={h} className="px-5 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {subs.map((s) => (
                                <tr key={s.id} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3">
                                        <span className="block text-sm font-medium truncate">{s.userName}</span>
                                        {s.userEmail && <span className="block text-[11px] text-[var(--muted)] truncate">{s.userEmail}</span>}
                                    </td>
                                    <td className="px-5 py-3 text-sm capitalize">{s.plan_key}</td>
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)]">{s.interval}</td>
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(s.current_period_end || s.trial_ends_at)}</td>
                                    <td className="px-5 py-3"><StatusChip status={SUB_STATUS[s.status] || 'no-connection'} label={s.status} /></td>
                                </tr>
                            ))}
                            {!loading && subs.length === 0 && (
                                <tr className="border-t border-[var(--border)]"><td colSpan={5} className="px-5 py-8 text-center text-sm text-[var(--muted)]">No subscriptions yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PlansPanel;
