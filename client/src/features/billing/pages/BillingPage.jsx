import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles, CreditCard, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/features/auth';
import {
    fetchPlans, fetchMyBilling, subscribe, verifySubscription, cancelSubscription,
    money, loadRazorpay,
} from '../lib/billingApi';

const DAY_MS = 24 * 60 * 60 * 1000;

const UsageBar = ({ label, used, limit }) => {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    return (
        <div>
            <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--muted)]">{label}</span>
                <span className="font-mono text-[var(--text)]">{used}{limit === null ? '' : ` / ${limit}`}</span>
            </div>
            {limit !== null && (
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
};

const BillingPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [me, setMe] = useState(null);
    const [plans, setPlans] = useState([]);
    const [interval, setBillingInterval] = useState('yearly');
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState(null);
    const [now] = useState(() => Date.now()); // mount-time clock; render must not read Date.now

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [meRes, planRes] = await Promise.all([fetchMyBilling(), fetchPlans()]);
            setMe(meRes);
            setPlans(planRes.plans || []);
            if (meRes.interval) setBillingInterval(meRes.interval);
        } catch (err) {
            toast.error(err.message || 'Could not load billing');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

    const handleSubscribe = async (plan) => {
        if (busyKey) return;
        setBusyKey(plan.key);
        try {
            const order = await subscribe({ planKey: plan.key, interval });
            const Razorpay = await loadRazorpay();
            const rzp = new Razorpay({
                key: order.keyId,
                subscription_id: order.subscriptionId,
                name: 'Bitlance',
                description: `${order.planName} · ${interval}`,
                prefill: { email: user?.email || '' },
                theme: { color: '#26CECE' },
                handler: async (resp) => {
                    try {
                        await verifySubscription({
                            paymentId: resp.razorpay_payment_id,
                            subscriptionId: resp.razorpay_subscription_id,
                            signature: resp.razorpay_signature,
                        });
                        toast.success(`You're on ${order.planName}!`);
                        load();
                    } catch (err) {
                        toast.error(err.message || 'Payment verification failed');
                    }
                },
                modal: { ondismiss: () => setBusyKey(null) },
            });
            rzp.on('payment.failed', () => { toast.error('Payment failed'); setBusyKey(null); });
            rzp.open();
        } catch (err) {
            toast.error(err.message || 'Could not start checkout');
            setBusyKey(null);
        }
    };

    const handleCancel = async () => {
        if (!window.confirm('Cancel your subscription? You keep access until the current period ends.')) return;
        try {
            await cancelSubscription();
            toast.success('Subscription cancelled');
            load();
        } catch (err) {
            toast.error(err.message || 'Could not cancel');
        }
    };

    const trialDaysLeft = me?.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(me.trialEndsAt).getTime() - now) / DAY_MS))
        : null;

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <header className="sticky top-0 z-10 bg-[var(--bg)]/95 backdrop-blur px-4 sm:px-6 py-4 border-b border-[var(--border)]">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button onClick={() => navigate('/socialdashboad')} className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors" title="Back to dashboard">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h1 className="font-['Space_Grotesk'] text-lg font-extrabold tracking-tight flex-1">Billing & plan</h1>
                    <Link to="/pricing" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]">Compare plans →</Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
                {loading || !me ? (
                    <div className="py-16 text-center text-sm text-[var(--muted)]">Loading…</div>
                ) : (
                    <>
                        {/* Trial / expiry banners */}
                        {me.trialActive && (
                            <div className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-6" style={{ borderColor: 'rgba(38,206,206,0.4)', background: 'var(--accent-muted)' }}>
                                <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                                <span className="text-[13px]">You're on a free trial — <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left</strong>. Subscribe below to keep your accounts publishing.</span>
                            </div>
                        )}
                        {me.trialExpired && (
                            <div className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-6" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}>
                                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#F87171' }} />
                                <span className="text-[13px]">Your free trial has ended. Subscribe to resume scheduling and publishing.</span>
                            </div>
                        )}

                        {/* Current plan + usage */}
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">Current plan</span>
                                    <p className="font-['Space_Grotesk'] text-xl font-extrabold tracking-tight">
                                        {me.planName}
                                        <span className="ml-2 text-[10px] font-mono uppercase tracking-widest align-middle" style={{ color: me.active ? '#26CECE' : '#F87171' }}>{me.status}</span>
                                    </p>
                                </div>
                                {me.status !== 'cancelled' && me.status !== 'trialing' && me.status === 'active' && (
                                    <button onClick={handleCancel} className="text-xs text-[var(--muted)] hover:text-red-500 transition-colors">Cancel</button>
                                )}
                            </div>
                            <div className="grid sm:grid-cols-3 gap-4">
                                <UsageBar label="Social accounts" used={me.usage.accounts} limit={me.limits.accounts} />
                                <UsageBar label="Workspaces" used={me.usage.workspaces} limit={me.limits.workspaces} />
                                <UsageBar label="Team members" used={me.usage.users} limit={me.limits.users} />
                            </div>
                        </div>

                        {!me.paymentsEnabled && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 mb-6 text-[13px]" style={{ color: '#FBBF24' }}>
                                Payments are not configured on the server yet — checkout is disabled.
                            </div>
                        )}

                        {/* Interval toggle */}
                        <div className="flex items-center gap-3 mb-4">
                            <h2 className="flex-1 font-['Space_Grotesk'] text-lg font-bold tracking-tight">Change plan</h2>
                            <div className="inline-flex items-center gap-1 p-1 rounded-full border border-[var(--border)] bg-[var(--surface)]">
                                {['monthly', 'yearly'].map((iv) => (
                                    <button key={iv} onClick={() => setBillingInterval(iv)} className={`px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${interval === iv ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}>
                                        {iv === 'yearly' ? 'Yearly · save' : 'Monthly'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Plan cards */}
                        <div className="grid sm:grid-cols-3 gap-4">
                            {plans.map((p) => {
                                const isCurrent = p.key === me.planKey && (me.status === 'active');
                                const price = interval === 'yearly' ? p.yearlyPrice : p.monthlyPrice;
                                return (
                                    <div key={p.key} className={`flex flex-col rounded-2xl border p-5 ${p.highlighted ? 'border-[var(--accent)]' : 'border-[var(--border)]'} bg-[var(--surface)]`}>
                                        <h3 className="font-['Space_Grotesk'] font-extrabold tracking-tight">{p.name}</h3>
                                        <div className="mt-2 mb-3 flex items-end gap-1.5">
                                            <span className="font-['Space_Grotesk'] text-2xl font-extrabold tracking-tight">{money(price, p.currency)}</span>
                                            <span className="text-xs text-[var(--muted)] mb-0.5">/ {interval === 'yearly' ? 'yr' : 'mo'}</span>
                                        </div>
                                        <ul className="space-y-1.5 mb-4 flex-1">
                                            <li className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]"><Check className="h-3.5 w-3.5 text-[var(--accent)]" />{p.includedAccounts ?? '∞'} accounts</li>
                                            <li className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]"><Check className="h-3.5 w-3.5 text-[var(--accent)]" />{p.includedWorkspaces ?? '∞'} workspaces</li>
                                            <li className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]"><Check className="h-3.5 w-3.5 text-[var(--accent)]" />{p.includedUsers ?? '∞'} users</li>
                                        </ul>
                                        <button
                                            onClick={() => handleSubscribe(p)}
                                            disabled={isCurrent || busyKey === p.key || !me.paymentsEnabled}
                                            className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${isCurrent ? 'border border-[var(--border)] text-[var(--muted)]' : 'btn-primary'}`}
                                        >
                                            {isCurrent ? 'Current plan' : busyKey === p.key ? 'Opening…' : (<><CreditCard className="h-4 w-4" /> Choose {p.name}</>)}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default BillingPage;
