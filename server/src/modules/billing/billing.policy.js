export const billingError = (message, status = 402) => Object.assign(new Error(message), { status });

export function subscriptionAccess(sub, now = Date.now()) {
    if (sub.billing_exempt) return { active: true, billingExempt: true, manualPaid: false, trialActive: false, trialExpired: false, mandateRequired: false };
    const trialEnd = Date.parse(sub.trial_ends_at);
    const periodEnd = Date.parse(sub.current_period_end);
    const authorized = !sub.mandate_required || Boolean(sub.mandate_authorized_at);
    const trialActive = sub.status === 'trialing' && trialEnd > now && authorized;
    const paidActive = sub.status === 'active' && periodEnd > now;
    const manualPaid = Date.parse(sub.manual_paid_until) > now;
    return {
        active: Boolean(trialActive || paidActive || manualPaid),
        manualPaid,
        trialActive: Boolean(trialActive && !manualPaid),
        trialExpired: !manualPaid && sub.status === 'trialing' && trialEnd <= now,
        mandateRequired: !manualPaid && sub.mandate_required && !sub.mandate_authorized_at,
    };
}

export function providerPatch(remote, local, now = Date.now()) {
    const statuses = { active: 'active', pending: 'past_due', halted: 'halted',
        cancelled: 'cancelled', completed: 'cancelled', expired: 'cancelled' };
    const patch = { updated_at: new Date(now).toISOString() };
    if (remote.status === 'authenticated') {
        // Authorization is not a paid billing period; never resurrect a ended subscription.
        if (local.status === 'trialing') patch.status = 'trialing';
        patch.mandate_authorized_at = local.mandate_authorized_at || new Date(now).toISOString();
    } else if (statuses[remote.status]) {
        patch.status = statuses[remote.status];
        if (remote.status === 'active') patch.mandate_authorized_at = local.mandate_authorized_at || new Date(now).toISOString();
    }
    if (remote.current_start) patch.current_period_start = new Date(remote.current_start * 1000).toISOString();
    if (remote.current_end) patch.current_period_end = new Date(remote.current_end * 1000).toISOString();
    return patch;
}

export function generationPeriod(_sub, now = new Date()) {
    // Monthly allowance, including subscriptions billed annually.
    return now.toISOString().slice(0, 7);
}
