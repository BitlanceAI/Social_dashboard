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
import { supabaseAdmin } from '../../config/supabase.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_PLAN = 'growth'; // trial gives the mid tier's allowances

const razorpayAuth = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, header: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') };
};

export const isConfigured = () => Boolean(razorpayAuth());

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
        trialDays: TRIAL_DAYS,
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

/** The user's subscription row, creating a 14-day trial the first time. */
export const ensureSubscription = async (userId) => {
    const { data: existing } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
    if (existing) return existing;

    const trialEnds = new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString();
    const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
            user_id: userId,
            plan_key: DEFAULT_TRIAL_PLAN,
            interval: 'monthly',
            status: 'trialing',
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
    const { data: workspaces } = await supabaseAdmin
        .from('workspaces').select('id').eq('owner_id', userId);
    const wsIds = (workspaces || []).map((w) => w.id);
    const workspaceCount = wsIds.length;

    if (wsIds.length === 0) return { accounts: 0, workspaces: 0, users: 0 };

    const [metaRes, liRes, memberRes] = await Promise.all([
        supabaseAdmin.from('meta_connections')
            .select('pages, selected_page_ids').in('workspace_id', wsIds).eq('is_active', true),
        supabaseAdmin.from('linkedin_connections')
            .select('id').in('workspace_id', wsIds).eq('is_active', true),
        supabaseAdmin.from('workspace_members')
            .select('user_id').in('workspace_id', wsIds),
    ]);

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
    const plan = await getPlanRow(sub.plan_key);
    const usage = await getUsage(userId);

    const now = Date.now();
    const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
    const trialActive = sub.status === 'trialing' && trialEnds && trialEnds > now;
    const trialExpired = sub.status === 'trialing' && trialEnds && trialEnds <= now;

    // A billing-usable state: paid-active or still inside the trial window.
    const active = sub.status === 'active' || trialActive;

    const cap = (base) => (base === null || base === undefined ? null : base);
    return {
        planKey: sub.plan_key,
        planName: plan.name,
        interval: sub.interval,
        status: sub.status,
        active,
        trialActive,
        trialExpired,
        trialEndsAt: sub.trial_ends_at,
        currentPeriodEnd: sub.current_period_end,
        limits: {
            accounts: cap(plan.included_accounts) === null ? null : plan.included_accounts + sub.extra_accounts,
            users: cap(plan.included_users) === null ? null : plan.included_users + sub.extra_users,
            workspaces: cap(plan.included_workspaces),
            dailyPosts: cap(plan.daily_post_limit),
        },
        usage,
        extraAccounts: sub.extra_accounts,
        extraUsers: sub.extra_users,
        paymentsEnabled: isConfigured(),
    };
};

/** True when adding `add` more of `kind` would exceed the plan (null = unlimited). */
export const wouldExceed = async (userId, kind, add = 1) => {
    try {
        const ent = await getEntitlement(userId);
        const limit = ent.limits[kind];
        if (limit === null || limit === undefined) return false; // unlimited
        return ent.usage[kind] + add > limit;
    } catch (err) {
        // Fail OPEN: a billing lookup failure must never block core actions.
        console.error('[billing] wouldExceed check failed, allowing:', err.message);
        return false;
    }
};

/**
 * Would publishing/scheduling one more post today exceed the plan's per-account
 * daily cap? Counts today's posts (published + still-pending) for this page in
 * the workspace. Fails OPEN. `dailyPostLimit` NULL = unlimited.
 */
export const dailyPostCapExceeded = async (userId, workspaceId, pageId) => {
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
        console.error('[billing] daily-post cap check skipped:', err.message);
        return false;
    }
};

/** Create a Razorpay subscription for a plan+interval and store it as pending. */
export const createSubscription = async (userId, planKey, interval) => {
    const auth = razorpayAuth();
    if (!auth) {
        const err = new Error('Payments are not configured');
        err.status = 503;
        throw err;
    }
    const plan = await getPlanRow(planKey);
    const razorpayPlanId = interval === 'yearly' ? plan.razorpay_plan_id_yearly : plan.razorpay_plan_id_monthly;
    if (!razorpayPlanId) {
        const err = new Error(`This plan is not available for ${interval} checkout yet`);
        err.status = 503;
        throw err;
    }

    // total_count: how many billing cycles before Razorpay stops. Long horizon.
    const totalCount = interval === 'yearly' ? 10 : 120;
    const res = await fetch(`${RAZORPAY_API}/subscriptions`, {
        method: 'POST',
        headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            plan_id: razorpayPlanId,
            total_count: totalCount,
            customer_notify: 1,
            notes: { user_id: userId, plan_key: planKey, interval },
        }),
    });
    const subscription = await res.json();
    if (!res.ok) {
        console.error('[billing] razorpay subscription failed:', subscription);
        const err = new Error(subscription?.error?.description || 'Could not start the subscription');
        err.status = 502;
        throw err;
    }

    await supabaseAdmin
        .from('subscriptions')
        .upsert({
            user_id: userId,
            plan_key: planKey,
            interval,
            status: 'past_due', // pending activation until the first charge verifies
            razorpay_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    return {
        subscriptionId: subscription.id,
        keyId: auth.keyId,
        planName: plan.name,
    };
};

/** Verify the checkout signature and activate the subscription. */
export const verifySubscription = async (userId, { paymentId, subscriptionId, signature }) => {
    const auth = razorpayAuth();
    if (!auth) {
        const err = new Error('Payments are not configured');
        err.status = 503;
        throw err;
    }
    // For subscriptions the signed payload is payment_id|subscription_id.
    const expected = crypto
        .createHmac('sha256', auth.keySecret)
        .update(`${paymentId}|${subscriptionId}`)
        .digest('hex');
    const valid =
        expected.length === String(signature).length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    if (!valid) {
        const err = new Error('Payment signature did not verify');
        err.status = 400;
        throw err;
    }

    const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('razorpay_subscription_id', subscriptionId);
    if (error) throw error;
    return { active: true };
};

/** Cancel: keep access until the period ends (Razorpay cancel_at_cycle_end). */
export const cancelSubscription = async (userId) => {
    const sub = await ensureSubscription(userId);
    if (!sub.razorpay_subscription_id) {
        const err = new Error('No active subscription to cancel');
        err.status = 400;
        throw err;
    }
    const auth = razorpayAuth();
    if (auth) {
        await fetch(`${RAZORPAY_API}/subscriptions/${sub.razorpay_subscription_id}/cancel`, {
            method: 'POST',
            headers: { Authorization: auth.header, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancel_at_cycle_end: 1 }),
        }).catch((e) => console.error('[billing] razorpay cancel failed:', e.message));
    }
    await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    return { cancelled: true };
};

/**
 * Razorpay webhook — the source of truth for recurring status. Verified with
 * the webhook secret, then maps the event to a subscription status.
 */
export const handleWebhook = async (rawBody, signature) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('[billing] webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring');
        return { ignored: true };
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signature) {
        const err = new Error('Invalid webhook signature');
        err.status = 400;
        throw err;
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const sub = event?.payload?.subscription?.entity;
    if (!sub?.id) return { ignored: true };

    const STATUS = {
        'subscription.activated': 'active',
        'subscription.charged': 'active',
        'subscription.pending': 'past_due',
        'subscription.halted': 'halted',
        'subscription.cancelled': 'cancelled',
        'subscription.completed': 'cancelled',
    };
    const status = STATUS[event.event];
    if (!status) return { ignored: true };

    const patch = { status, updated_at: new Date().toISOString() };
    if (sub.current_end) patch.current_period_end = new Date(sub.current_end * 1000).toISOString();

    await supabaseAdmin
        .from('subscriptions')
        .update(patch)
        .eq('razorpay_subscription_id', sub.id);
    return { ok: true, status };
};

export { TRIAL_DAYS };
