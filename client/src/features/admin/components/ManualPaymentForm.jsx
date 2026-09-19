import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { markManualPayment } from '../lib/adminApi';

export default function ManualPaymentForm({ subscription, plan, onClose, onSaved }) {
    const [requestId] = useState(() => crypto.randomUUID());
    const [amount, setAmount] = useState(() => String((subscription.interval === 'yearly' ? plan?.yearly_price : plan?.monthly_price) / 100 || ''));
    const [paidUntil, setPaidUntil] = useState('');
    const [reference, setReference] = useState('');
    const [busy, setBusy] = useState(false);
    const field = 'block w-full mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-[var(--text)]';
    const submit = async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            await markManualPayment(subscription.id, {
                requestId, amount: Math.round(Number(amount) * 100), reference,
                paidUntil: new Date(paidUntil).toISOString(),
            });
            toast.success('Payment recorded. Paid access is now available.');
            onSaved();
        } catch (error) { toast.error(error.message || 'Could not record payment'); }
        finally { setBusy(false); }
    };
    return <form onSubmit={submit} className="rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-5 space-y-4" aria-label="Record manual payment">
        <div>
            <h2 className="font-semibold">Mark payment received — {subscription.userName}</h2>
            <p className="text-sm text-[var(--muted)]">{subscription.userEmail} · {plan?.name || subscription.plan_key}. Record money already received to grant access through the selected date.</p>
            {subscription.razorpay_subscription_id && <p className="text-sm mt-2 text-[var(--muted)]">This customer has a Razorpay subscription. Recording this payment does not stop its automatic charges.</p>}
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
            <label className="text-sm">Amount received ({plan?.currency || 'INR'})<input className={field} type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} /></label>
            <label className="text-sm">Paid through (your local time)<input className={field} type="datetime-local" required value={paidUntil} onChange={e => setPaidUntil(e.target.value)} disabled={busy} /></label>
            <label className="text-sm">Payment reference / receipt<input className={field} maxLength={200} required value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI reference, bank transfer or cash receipt" disabled={busy} /></label>
        </div>
        <div className="flex gap-3">
            <button className="btn-primary rounded-xl px-4 py-2" type="submit" disabled={busy}>{busy ? 'Recording…' : 'Mark payment received'}</button>
            <button className="text-sm px-3" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
    </form>;
}
