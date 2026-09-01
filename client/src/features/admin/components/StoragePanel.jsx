import React, { useState, useEffect, useCallback } from 'react';
import { IndianRupee, Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchStorageSettings, updateStorageSettings, fetchStoragePurchases } from '../lib/adminApi';
import StatusChip from './StatusChip';

const inputClass =
    'w-full px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] transition-colors';

const money = (minor, currency = 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 })
        .format(minor / 100);

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// storage_purchases.status → StatusChip tone (paid reads as healthy teal)
const CHIP_STATUS = { paid: 'active', created: 'pending', failed: 'failed' };

/**
 * Admin Storage tab: the price users pay per GB per month, how long media
 * survives after a plan lapses, and every purchase across the platform.
 * The form edits rupees; the API stores paise.
 */
const StoragePanel = () => {
    const [priceRupees, setPriceRupees] = useState('');
    const [deleteDays, setDeleteDays] = useState('');
    const [paymentsEnabled, setPaymentsEnabled] = useState(true);
    const [purchases, setPurchases] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [settings, history] = await Promise.all([fetchStorageSettings(), fetchStoragePurchases()]);
            setPriceRupees(String(settings.pricePerGbMonth / 100));
            setDeleteDays(String(settings.deleteAfterDays));
            setPaymentsEnabled(settings.paymentsEnabled);
            setPurchases(history.purchases);
        } catch (err) {
            toast.error(err.message || 'Could not load storage settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(load, 0);
        return () => clearTimeout(t);
    }, [load]);

    const handleSave = async (e) => {
        e.preventDefault();
        const paise = Math.round(parseFloat(priceRupees) * 100);
        const days = parseInt(deleteDays, 10);
        if (!Number.isInteger(paise) || paise < 100) {
            toast.error('Price must be at least ₹1');
            return;
        }
        if (!Number.isInteger(days) || days < 0 || days > 365) {
            toast.error('Delete window must be 0–365 days');
            return;
        }
        setSaving(true);
        try {
            await updateStorageSettings({ pricePerGbMonth: paise, deleteAfterDays: days });
            toast.success('Storage settings saved');
        } catch (err) {
            toast.error(err.message || 'Could not save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {!paymentsEnabled && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px]" style={{ color: '#FBBF24' }}>
                    Razorpay keys are not configured on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) —
                    users see the buy button disabled until they are.
                </div>
            )}

            {/* Settings */}
            <form onSubmit={handleSave} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h2 className="text-[15px] font-semibold mb-4">Pricing & retention</h2>
                <div className="grid sm:grid-cols-2 gap-5">
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
                            <IndianRupee className="h-3 w-3" /> Price per GB per month
                        </span>
                        <input
                            type="number" min="1" step="0.01" required
                            value={priceRupees}
                            onChange={(e) => setPriceRupees(e.target.value)}
                            className={inputClass}
                            placeholder="50"
                        />
                        <span className="block text-[11px] text-[var(--muted)] mt-1.5">
                            What a user pays for 1 GB kept for 1 month. Orders are always priced server-side from this value.
                        </span>
                    </label>
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
                            <Clock className="h-3 w-3" /> Delete after expiry (days)
                        </span>
                        <input
                            type="number" min="0" max="365" required
                            value={deleteDays}
                            onChange={(e) => setDeleteDays(e.target.value)}
                            className={inputClass}
                            placeholder="30"
                        />
                        <span className="block text-[11px] text-[var(--muted)] mt-1.5">
                            Grace period after a plan lapses before stored media may be deleted. Shown to users on the storage page.
                        </span>
                    </label>
                </div>
                <div className="flex justify-end mt-5">
                    <button type="submit" disabled={saving || loading} className="btn-primary rounded-xl px-5 py-2 text-sm disabled:opacity-60">
                        {saving ? 'Saving…' : 'Save settings'}
                    </button>
                </div>
            </form>

            {/* Purchases */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="flex items-center px-5 pt-5 pb-3">
                    <h2 className="flex-1 text-[15px] font-semibold">Purchases</h2>
                    <button
                        onClick={load}
                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-[var(--surface-2)]">
                                {['User', 'Plan', 'Amount', 'Bought', 'Valid until', 'Status'].map((h) => (
                                    <th key={h} className="px-5 py-2.5 text-[10px] font-mono font-normal uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {purchases.map((p) => (
                                <tr key={p.id} className="border-t border-[var(--border)]">
                                    <td className="px-5 py-3">
                                        <span className="block text-sm font-medium truncate">{p.userName}</span>
                                        {p.userEmail && <span className="block text-[11px] text-[var(--muted)] truncate">{p.userEmail}</span>}
                                    </td>
                                    <td className="px-5 py-3 text-sm whitespace-nowrap">{p.gb} GB · {p.months} mo</td>
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)]">{money(p.amount, p.currency)}</td>
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(p.created_at)}</td>
                                    <td className="px-5 py-3 text-xs font-mono text-[var(--muted)] whitespace-nowrap">{fmtDate(p.expires_at)}</td>
                                    <td className="px-5 py-3"><StatusChip status={CHIP_STATUS[p.status] || p.status} label={p.status} /></td>
                                </tr>
                            ))}
                            {!loading && purchases.length === 0 && (
                                <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                                        No purchases yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StoragePanel;
