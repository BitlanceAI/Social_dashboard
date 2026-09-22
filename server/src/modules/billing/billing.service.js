/**
 * Subscription billing — plan catalog, Razorpay subscriptions, entitlement.
 *
 * Razorpay is driven over its REST API with Basic auth, the same pattern as
 * modules/storage (which uses one-time Orders). Subscriptions are a DIFFERENT
 * Razorpay product: a plan is created in Razorpay, then a subscription is
 * created against that plan id. Amounts are in the currency's minor unit.
 */

import '../../config/env.js';

import crypto from 'crypto';
import { isBillingExempt } from './billing-exemption.js';
import { billingError, subscriptionAccess, providerPatch, generationPeriod } from './billing.policy.js';
import { supabaseAdmin } from '../../config/supabase.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const TRIAL_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_PLAN = 'solo';

const razorpayAuth = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, header: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') };
};

export const isConfigured = () => Boolean(razorpayAuth() && process.env.RAZORPAY_WEBHOOK_SECRET);

// ── Plan catalog ─────────────────────────────────────────────────────────────

const publicPlan = (p) => ({
    key: p.plan_key,
    name: p.name,
    tagline: p.tagline,
    monthlyPrice: p.monthly_price,
    yearlyPrice: p.yearly_price,
    currency: p.currency,
    includedAccounts: p.included_accounts,
    includedUsers: p.included_users,
    includedWorkspaces: p.included_workspaces,
    dailyPostLimit: p.daily_post_limit,
    generationLimit: p.generation_limit,
    trialAutoPostLimit: p.trial_auto_post_limit,
    trialDays: p.trial_days,
    mandateRequired: p.mandate_required,
    features: Array.isArray(p.features) ? p.features : [],
    highlighted: p.highlighted,
    monthlyPurchasable: Boolean(p.razorpay_plan_id_monthly),
    yearlyPurchasable: Boolean(p.razorpay_plan_id_yearly),
});

export const getPlans = async () => {
    const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
    if (error) throw error;
    return {
        plans: (data || []).map(publicPlan),
        paymentsEnabled: isConfigured(),
        trialDays: data?.find(p => p.plan_key === DEFAULT_TRIAL_PLAN)?.trial_days ?? TRIAL_DAYS,
    };
};

const getPlanRow = async (planKey) => {
    const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('plan_key', planKey)
        .single();
    if (error || !data) {
        const err = new Error('Unknown plan');
        err.status = 400;
        throw err;
    }
    return data;
};

// ── Subscription lifecycle ───────────────────────────────────────────────────

/** New accounts wait for payment setup; existing subscriptions retain their state. */
export const ensureSubscription = async (userId) => {
    if (await isBillingExempt(userId)) return { user_id: userId, billing_exempt: true, status: 'active' };
    const { data: existing, error: lookupError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing;

    const plan = await getPlanRow(DEFAULT_TRIAL_PLAN);
    const trialEnds = plan.mandate_required ? null : new Date(Date.now() + plan.trial_days * DAY_MS).toISOString();
    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
            user_id: userId,
            plan_key: DEFAULT_TRIAL_PLAN,
            interval: 'monthly',
            status: 'trialing',
            mandate_required: plan.mandate_required,
            trial_ends_at: trialEnds,
            current_period_end: trialEnds,
        })
        .select('*')
        .single();
    if (error) {
        // A concurrent request may have created it (UNIQUE user_id) — read back.
        const { data: raced } = await supabaseAdmin
            .from('subscriptions').select('*').eq('user_id', userId).single();
        if (raced) return raced;
        throw error;
    }
    return data;
};

/** Connected accounts / workspaces / teammates the user is currently using. */
const getUsage = async (userId) => {
    // Workspaces the user owns; the subscription covers these.
    const { data: workspaces, error: workspaceError } = await supabaseAdmin
        .from('workspaces').select('id').eq('owner_id', userId);
    if (workspaceError) throw workspaceError;
    const wsIds = (workspaces || []).map((w) => w.id);
    const workspaceCount = wsIds.length;

    if (wsIds.length === 0) return { accounts: 0, workspaces: 0, users: 0 };

    const [metaRes, liRes, memberRes, igRes] = await Promise.all([
        supabaseAdmin.from('meta_connections')
            .select('pages, selected_page_ids').in('workspace_id', wsIds).eq('is_active', true),
        supabaseAdmin.from('linkedin_connections')
            .select('id').in('workspace_id', wsIds).eq('is_active', true),
        supabaseAdmin.from('workspace_members')
            .select('user_id').in('workspace_id', wsIds),
        supabaseAdmin.from('instagram_connections')
            .select('id').in('workspace_id', wsIds).eq('is_active', true),
    ]);

    for (const result of [metaRes, liRes, memberRes]) if (result.error) throw result.error;
    if (igRes.error && !['42P01', 'PGRST205'].includes(igRes.error.code)) throw igRes.error;

    // A "social account" = each selected Facebook Page, plus its linked
    // Instagram, plus each LinkedIn connection — mirrors the dashboard targets.
    let accounts = 0;
    for (const conn of metaRes.data || []) {
        const pages = Array.isArray(conn.pages) ? conn.pages : [];
        const selected = Array.isArray(conn.selected_page_ids)
            ? pages.filter((p) => conn.selected_page_ids.map(String).includes(String(p.id)))
            : pages;
        accounts += selected.length;
        accounts += selected.filter((p) => p.instagram_business_account).length;
    }
    accounts += (liRes.data || []).length;
    accounts += (igRes.data || []).length;

    const uniqueMembers = new Set((memberRes.data || []).map((m) => m.user_id));
    const users = Math.max(0, uniqueMembers.size); // includes owner

    return { accounts, workspaces: workspaceCount, users };
};

/**
 * Everything the app needs to gate features and render the billing page:
 * plan, limits (with add-ons folded in), live usage, and trial/active status.
 */
export const getEntitlement = async (userId) => {
    const sub = await ensureSubscription(userId);
    if (sub.billing_exempt) return {
        ...subscriptionAccess(sub), planKey: 'admin', planName: 'Admin — unrestricted', status: 'active', interval: 'monthly',
        trialEndsAt: null, currentPeriodEnd: null, mandateAuthorized: false, hasSubscription: false,
        limits: { accounts: null, users: null, workspaces: null, dailyPosts: null, generations: null, trialAutoPosts: null },
        usage: { ...(await getUsage(userId)), generations: 0, trialAutoPosts: 0 },
        extraAccounts: 0, extraUsers: 0, paymentsEnabled: isConfigured(),
    };
    const plan = await getPlanRow(sub.plan_key);
    const usage = await getUsage(userId);

    const access = subscriptionAccess(sub);
    const period = generationPeriod(sub);
    const { data: counts, error: usageError } = await supabaseAdmin.from('subscription_usage')
        .select('kind, period_key, used').eq('user_id', userId)
        .in('period_key', [period, `trial:${sub.id}`]);
    if (usageError) throw usageError;
    usage.generations = counts?.find(r => r.kind === 'generations' && r.period_key === period)?.used || 0;
    usage.trialAutoPosts = counts?.find(r => r.kind === 'trial_auto_posts')?.used || 0;

    const cap = (base) => (base === null || base === undefined ? null : base);
    return {
        planKey: sub.plan_key,
        planName: plan.name,
        interval: sub.interval,
        status: access.manualPaid ? 'active' : sub.status,
        manualPaidUntil: sub.manual_paid_until,
        ...access,
        mandateAuthorized: Boolean(sub.mandate_authorized_at),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        hasSubscription: Boolean(sub.razorpay_subscription_id),
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        limits: {
            accounts: cap(plan.included_accounts) === null ? null : plan.included_accounts + sub.extra_accounts,
            users: cap(plan.included_users) === null ? null : plan.included_users + sub.extra_users,
            workspaces: cap(plan.included_workspaces),
            dailyPosts: cap(plan.daily_post_limit),
            generations: cap(plan.generation_limit),
            trialAutoPosts: cap(plan.trial_auto_post_limit),
        },
        usage,
        extraAccounts: sub.extra_accounts,
        extraUsers: sub.extra_users,
        paymentsEnabled: isConfigured(),
    };
};

/** True when adding `add` more of `kind` would exceed the plan (null = unlimited). */
export const wouldExceed = async (userId, kind, add = 1) => {
    if (await isBillingExempt(userId)) return false;
    try {
        const ent = await getEntitlement(userId);
        const limit = ent.limits[kind];
        if (limit === null || limit === undefined) return false; // unlimited
        return ent.usage[kind] + add > limit;
    } catch (err) {
        throw err;
    }
};

/**
 * Would publishing/scheduling one more post today exceed the plan's per-account
 * daily cap? Counts today's posts (published + still-pending) for this page in
 * the workspace. Lookup errors block the operation. `dailyPostLimit` NULL = unlimited.
 */
export const dailyPostCapExceeded = async (userId, workspaceId, pageId) => {
    if (await isBillingExempt(userId)) return false;
    try {
        const ent = await getEntitlement(userId);
        const limit = ent.limits.dailyPosts;
        if (limit === null || limit === undefined) return false;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { count, error } = await supabaseAdmin
            .from('scheduled_posts')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('page_id', String(pageId))
            .gte('scheduled_time', startOfDay.toISOString())
            .in('status', ['pending', 'processing', 'published']);
        if (error) throw error;

        return (count ?? 0) + 1 > limit;
    } catch (err) {
        throw err;
    }
};


// Provider responses, not checkout callbacks, determine billing state.
const providerRequest = async (path, body) => {
    const auth = razorpayAuth();
    if (!auth) throw billingError('Payments are not configured', 503);
    const response = await fetch(`${RAZORPAY_API}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw billingError(result?.error?.description || 'Payment provider unavailable', 502);
    return result;
};

const saveSubscription = async (userId, patch, providerId) => {
    let query = supabaseAdmin.from('subscriptions').update(patch).eq('user_id', userId);
    if (providerId) query = query.eq('razorpay_subscription_id', providerId);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data;
};

export const createSubscription = async (userId, planKey, interval) => {
    if (await isBillingExempt(userId)) throw billingError('This admin account has unrestricted access and does not need a subscription', 400);
    if (!['monthly', 'yearly'].includes(interval)) throw billingError('Choose monthly or yearly billing', 400);
    const plan = await getPlanRow(planKey);
    if (!plan.is_active) throw billingError('This plan is not available', 400);
    const planId = interval === 'yearly' ? plan.razorpay_plan_id_yearly : plan.razorpay_plan_id_monthly;
    if (!planId) throw billingError('This billing option is not configured yet', 503);
    const auth = razorpayAuth();
    if (!auth || !isConfigured()) throw billingError('Payments are not configured', 503);
    const sub = await ensureSubscription(userId);
    if (sub.razorpay_subscription_id) {
        const remote = await providerRequest(`/subscriptions/${sub.razorpay_subscription_id}`);
        if (['created', 'authenticated', 'active', 'pending', 'halted'].includes(remote.status)) {
            if (sub.plan_key === planKey && sub.interval === interval && remote.status === 'created') {
                return { subscriptionId: remote.id, keyId: auth.keyId, planName: plan.name, trialEndsAt: sub.trial_ends_at };
            }
            throw billingError('Cancel your existing subscription before starting a different one', 409);
        }
    }
    // Validate provider pricing before accepting consent to the catalog price.
    const remotePlan = await providerRequest(`/plans/${planId}`);
    const price = interval === 'yearly' ? plan.yearly_price : plan.monthly_price;
    if (remotePlan.item?.amount !== price || remotePlan.item?.currency !== plan.currency || remotePlan.period !== interval || remotePlan.interval !== 1) {
        throw billingError('The payment plan does not match the displayed price. Contact support.', 503);
    }
    // Claim the checkout so concurrent requests cannot create duplicate mandates.
    const { data: claimed, error: claimError } = await supabaseAdmin.from('subscriptions')
        .update({ checkout_started_at: new Date().toISOString() }).eq('user_id', userId)
        .is('checkout_started_at', null).select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw billingError('Checkout is already being prepared. Please contact support if it does not complete.', 409);
    const trialEndsAt = sub.trial_ends_at || (!sub.mandate_authorized_at && sub.status === 'trialing'
        ? new Date(Date.now() + plan.trial_days * DAY_MS).toISOString() : null);
    const futureTrial = Date.parse(trialEndsAt) > Date.now();
    // Keep the checkout claim on uncertain network failures: retrying blindly can double bill.
    const remote = await providerRequest('/subscriptions', {
        plan_id: planId, total_count: interval === 'yearly' ? 10 : 120, customer_notify: 1,
        ...(futureTrial ? { start_at: Math.floor(Date.parse(trialEndsAt) / 1000) } : {}),
        notes: { user_id: userId, plan_key: planKey, interval },
    });
    await saveSubscription(userId, {
        plan_key: planKey, interval, status: futureTrial ? 'trialing' : 'past_due',
        trial_ends_at: trialEndsAt, current_period_end: futureTrial ? trialEndsAt : null,
        mandate_required: plan.mandate_required, mandate_authorized_at: null,
        razorpay_subscription_id: remote.id, checkout_started_at: null,
        cancel_at_period_end: false, recurring_consent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    return { subscriptionId: remote.id, keyId: auth.keyId, planName: plan.name, trialEndsAt };
};

export const verifySubscription = async (userId, { paymentId, subscriptionId, signature }) => {
    const auth = razorpayAuth();
    if (!auth) throw billingError('Payments are not configured', 503);
    const sub = await ensureSubscription(userId);
    if (sub.razorpay_subscription_id !== subscriptionId) throw billingError('Subscription does not belong to this account', 403);
    const expected = crypto.createHmac('sha256', auth.keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(signature) || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        throw billingError('Payment signature did not verify', 400);
    }
    const remote = await providerRequest(`/subscriptions/${subscriptionId}`);
    if (!['authenticated', 'active'].includes(remote.status)) throw billingError('Payment authorization is still pending', 409);
    const updated = await saveSubscription(userId, providerPatch(remote, sub), subscriptionId);
    return subscriptionAccess(updated);
};

export const cancelSubscription = async (userId) => {
    const sub = await ensureSubscription(userId);
    if (!sub.razorpay_subscription_id) throw billingError('No subscription to cancel', 400);
    const remote = await providerRequest(`/subscriptions/${sub.razorpay_subscription_id}`);
    const atEnd = remote.status === 'active';
    if (!['cancelled', 'completed', 'expired'].includes(remote.status)) {
        await providerRequest(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: atEnd ? 1 : 0 });
    }
    await saveSubscription(userId, { cancel_at_period_end: atEnd,
        ...(atEnd ? {} : { status: 'cancelled' }), updated_at: new Date().toISOString() }, sub.razorpay_subscription_id);
    return { cancelled: true, cancelAtPeriodEnd: atEnd };
};

export const handleWebhook = async (rawBody, signature) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw billingError('Webhook verification is not configured', 503);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(signature || '') || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        throw billingError('Invalid webhook signature', 400);
    }
    const event = JSON.parse(rawBody.toString('utf8'));
    const entity = event?.payload?.subscription?.entity;
    if (!entity?.id || !event.event?.startsWith('subscription.')) return { ignored: true };
    const { data: sub, error } = await supabaseAdmin.from('subscriptions').select('*')
        .eq('razorpay_subscription_id', entity.id).maybeSingle();
    if (error) throw error;
    if (!sub) throw billingError('Subscription has not been saved yet; retry delivery', 503);
    // Fetch current state, so a delayed failure event cannot undo a later payment.
    const remote = await providerRequest(`/subscriptions/${entity.id}`);
    const patch = providerPatch(remote, sub);
    const { error: updateError } = await supabaseAdmin.from('subscriptions').update(patch)
        .eq('user_id', sub.user_id).eq('razorpay_subscription_id', entity.id);
    if (updateError) throw updateError;
    return { ok: true };
};

export const billingOwner = async (userId, workspaceId) => {
    if (!workspaceId) return userId;
    const { data, error } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', workspaceId).single();
    if (error) throw error;
    return data.owner_id;
};

export const reserveUsage = async (userId, workspaceId, kind = 'generations') => {
    const ownerId = await billingOwner(userId, workspaceId);
    const sub = await ensureSubscription(ownerId);
    if (sub.billing_exempt) return null;
    if (!subscriptionAccess(sub).active) throw billingError('Set up payment authorization or renew your subscription to continue');
    const plan = await getPlanRow(sub.plan_key);
    if (kind === 'trial_auto_posts' && !subscriptionAccess(sub).trialActive) return;
    const limit = kind === 'generations' ? plan.generation_limit : plan.trial_auto_post_limit;
    const period = kind === 'generations' ? generationPeriod(sub) : `trial:${sub.id}`;
    const { data, error } = await supabaseAdmin.rpc('reserve_subscription_usage', {
        p_user: ownerId, p_kind: kind, p_period: period, p_limit: limit,
    });
    if (error) throw error;
    if (!data) throw billingError(kind === 'generations' ? 'Your AI generation allowance is used up' : 'Your trial automatic-post allowance is used up');
    return limit == null ? null : { p_user: ownerId, p_kind: kind, p_period: period };
};

export const releaseUsage = async (reservation) => {
    if (!reservation || reservation.released) return;
    reservation.released = true;
    const { p_user, p_kind, p_period } = reservation;
    const { error } = await supabaseAdmin.rpc('release_subscription_usage', { p_user, p_kind, p_period });
    if (error) console.error('[billing] Could not release failed operation quota:', error.message);
};

export const withGenerationUsage = async (userId, workspaceId, operation) => {
    const reservation = await reserveUsage(userId, workspaceId);
    try {
        const result = await operation();
        if (result.generationConfigured === false) await releaseUsage(reservation);
        return result;
    } catch (error) {
        await releaseUsage(reservation);
        throw error;
    }
};

export { TRIAL_DAYS };
