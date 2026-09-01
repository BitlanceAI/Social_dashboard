import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, HardDrive, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/features/auth';
import {
    fetchStorageConfig,
    fetchMyStorage,
    createStorageOrder,
    verifyStoragePayment,
    loadRazorpay,
    fmtBytes,
} from '../lib/storageApi';
import MediaLibrary from '../components/MediaLibrary';

const GB_OPTIONS = [1, 5, 10, 25];
const MONTH_OPTIONS = [1, 3, 6, 12];

const money = (minor, currency = 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 })
        .format(minor / 100);

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_STYLE = {
    paid: { background: 'var(--accent-muted)', color: 'var(--accent)' },
    created: { background: 'var(--surface-2)', color: 'var(--muted)' },
    failed: { background: 'rgba(248, 113, 113, 0.1)', color: '#F87171' },
};

/**
 * Media storage: what the user owns, and a Razorpay-backed buy flow.
 * The price always comes from the server (the admin sets it); the client
 * only ever sends gb × months, never an amount.
 */
const StoragePage = () => {
    const { user } = useAuth();
    const [config, setConfig] = useState(null);
    const [me, setMe] = useState(null);
    const [gb, setGb] = useState(5);
    const [months, setMonths] = useState(1);
    const [paying, setPaying] = useState(false);

    const load = useCallback(async () => {
        try {
            const [cfg, mine] = await Promise.all([fetchStorageConfig(), fetchMyStorage()]);
            setConfig(cfg);
            setMe(mine);
        } catch (err) {
            toast.error(err.message || 'Could not load storage');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const total = config ? config.pricePerGbMonth * gb * months : 0;

    const handleBuy = async () => {
        if (paying) return;
        setPaying(true);
        try {
            const Razorpay = await loadRazorpay();
            const { order } = await createStorageOrder({ gb, months });

            const checkout = new Razorpay({
                key: order.keyId,
                order_id: order.orderId,
                amount: order.amount,
                currency: order.currency,
                name: 'Botlance',
                description: `${gb} GB media storage · ${months} month${months === 1 ? '' : 's'}`,
                prefill: { email: user?.email || '' },
                theme: { color: '#26CECE' },
                handler: async (response) => {
                    try {
                        await verifyStoragePayment({
                            orderId: response.razorpay_order_id,
                            paymentId: response.razorpay_payment_id,
                            signature: response.razorpay_signature,
                        });
                        toast.success('Storage activated');
                        load();
                    } catch (err) {
                        toast.error(err.message || 'Payment could not be verified — contact support');
                    } finally {
                        setPaying(false);
                    }
                },
                modal: { ondismiss: () => setPaying(false) },
            });
            checkout.on('payment.failed', () => {
                toast.error('Payment failed — you were not charged storage');
                setPaying(false);
            });
            checkout.open();
        } catch (err) {
            toast.error(err.message || 'Could not start the payment');
            setPaying(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <div className="max-w-3xl mx-auto px-5 py-8">
                <Link
                    to="/socialdashboad"
                    className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to dashboard
                </Link>

                <div className="flex items-center gap-3 mb-1">
                    <HardDrive className="h-5 w-5 text-[var(--accent)]" />
                    <h1 className="text-[22px] font-bold tracking-tight">Media storage</h1>
                </div>
                <p className="text-[13px] text-[var(--muted)] mb-6">
                    Space for the images and videos your posts import directly from your library.
                </p>

                {/* Lapsed plan — the grace clock is running on their files */}
                {me?.purgeAt && (
                    <div
                        className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-6"
                        style={{ borderColor: 'rgba(248, 113, 113, 0.4)', background: 'rgba(248, 113, 113, 0.08)' }}
                    >
                        <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#F87171' }} />
                        <span className="text-[13px]">
                            Your storage expired on {fmtDate(me.expiredAt)}. Your library
                            ({fmtBytes(me.usedBytes)}) will be <strong>permanently deleted on {fmtDate(me.purgeAt)}</strong> —
                            renew below to keep it.
                        </span>
                    </div>
                )}

                {/* Expiry warning — unmissable when the plan is about to lapse */}
                {(() => {
                    if (!me?.nextExpiry || !config) return null;
                    const daysLeft = Math.ceil((new Date(me.nextExpiry) - Date.now()) / (24 * 60 * 60 * 1000));
                    if (daysLeft > 7) return null;
                    return (
                        <div
                            className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-6"
                            style={{
                                borderColor: daysLeft <= 2 ? 'rgba(248, 113, 113, 0.4)' : 'rgba(251, 191, 36, 0.4)',
                                background: daysLeft <= 2 ? 'rgba(248, 113, 113, 0.08)' : 'rgba(251, 191, 36, 0.08)',
                            }}
                        >
                            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: daysLeft <= 2 ? '#F87171' : '#FBBF24' }} />
                            <span className="text-[13px]">
                                Your storage lapses in {daysLeft} day{daysLeft === 1 ? '' : 's'} ({fmtDate(me.nextExpiry)}).
                                Files are kept {config.deleteAfterDays} more day{config.deleteAfterDays === 1 ? '' : 's'} after
                                that, then deleted — renew below to keep your library.
                            </span>
                        </div>
                    );
                })()}

                {/* Current entitlement */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">Active storage</span>
                        <span className="text-3xl font-bold tracking-tight">{me ? `${me.activeGb} GB` : '—'}</span>
                        {me && me.activeGb > 0 && (
                            <>
                                <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden mt-3">
                                    <div
                                        className="h-full rounded-full bg-[var(--accent)]"
                                        style={{ width: `${Math.min(100, (me.usedBytes / (me.activeGb * 1024 ** 3)) * 100)}%` }}
                                    />
                                </div>
                                <span className="block text-xs text-[var(--muted)] mt-1.5">
                                    {fmtBytes(me.usedBytes)} used
                                    {me.nextExpiry && ` · renews or lapses ${fmtDate(me.nextExpiry)}`}
                                </span>
                            </>
                        )}
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">After expiry</span>
                        <span className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-[var(--muted)]" />
                            {config ? `Files kept ${config.deleteAfterDays} days, then deleted` : '—'}
                        </span>
                    </div>
                </div>

                {/* Buy */}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
                    <h2 className="text-[15px] font-semibold mb-4">Buy storage</h2>

                    <div className="grid sm:grid-cols-2 gap-5 mb-5">
                        <div>
                            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">Size</span>
                            <div className="flex gap-2">
                                {GB_OPTIONS.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setGb(g)}
                                        className={`flex-1 py-2 rounded-xl border text-sm font-mono transition-colors ${
                                            gb === g
                                                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                                                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                                        }`}
                                    >
                                        {g} GB
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">Duration</span>
                            <div className="flex gap-2">
                                {MONTH_OPTIONS.map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setMonths(m)}
                                        className={`flex-1 py-2 rounded-xl border text-sm font-mono transition-colors ${
                                            months === m
                                                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                                                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                                        }`}
                                    >
                                        {m} mo
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-[var(--border)]">
                        <span className="flex-1">
                            <span className="block text-2xl font-bold tracking-tight">
                                {config ? money(total, config.currency) : '—'}
                            </span>
                            <span className="block text-xs text-[var(--muted)]">
                                {config && `${money(config.pricePerGbMonth, config.currency)} / GB / month`}
                            </span>
                        </span>
                        <button
                            onClick={handleBuy}
                            disabled={!config?.paymentsEnabled || paying}
                            className="btn-primary rounded-xl px-6 py-2.5 text-sm disabled:opacity-60"
                        >
                            {paying ? 'Processing…' : 'Pay with Razorpay'}
                        </button>
                    </div>
                    {config && !config.paymentsEnabled && (
                        <p className="text-xs text-[#FBBF24] mt-3">Payments are not configured yet — check back soon.</p>
                    )}
                </div>

                {/* Library */}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-6">
                    <h2 className="text-[15px] font-semibold mb-1">Your library</h2>
                    <p className="text-xs text-[var(--muted)] mb-4">
                        Files stored here can be imported directly into any post from the composer's Library tab.
                    </p>
                    <MediaLibrary onChanged={load} />
                </div>

                {/* History */}
                {me?.purchases?.length > 0 && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                        <h2 className="text-[15px] font-semibold px-5 pt-5 pb-3">Purchase history</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-[var(--surface-2)]">
                                        {['Plan', 'Amount', 'Valid until', 'Status'].map((h) => (
                                            <th key={h} className="px-5 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {me.purchases.map((p) => (
                                        <tr key={p.id} className="border-t border-[var(--border)]">
                                            <td className="px-5 py-3 text-sm whitespace-nowrap">{p.gb} GB · {p.months} mo</td>
                                            <td className="px-5 py-3 text-xs font-mono text-[var(--muted)]">{money(p.amount, p.currency)}</td>
                                            <td className="px-5 py-3 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(p.expires_at)}</td>
                                            <td className="px-5 py-3">
                                                <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-md" style={STATUS_STYLE[p.status]}>
                                                    {p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoragePage;
