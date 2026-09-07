-- ============================================================
-- User subscriptions
--
-- One subscription per user (the account owner), covering all their
-- workspaces. The account cap is counted across every workspace they own —
-- "billed per social account, not per seat". Existing one-time storage
-- purchases (storage_purchases) are separate and untouched.
--
-- New users get a 14-day trial lazily (ensureSubscription in the server),
-- following the ensure_default_workspace precedent — no signup trigger change.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_key                 TEXT NOT NULL REFERENCES public.subscription_plans(plan_key),
    interval                 TEXT NOT NULL DEFAULT 'monthly'
                             CHECK (interval IN ('monthly', 'yearly')),
    -- trialing → active on first successful charge; halted/past_due on failure;
    -- cancelled when the user cancels (kept until current_period_end).
    status                   TEXT NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing', 'active', 'past_due', 'halted', 'cancelled')),
    trial_ends_at            TIMESTAMPTZ,
    current_period_end       TIMESTAMPTZ,
    -- Paid add-ons stacked on the plan's included allowances.
    extra_accounts           INTEGER NOT NULL DEFAULT 0 CHECK (extra_accounts >= 0),
    extra_users              INTEGER NOT NULL DEFAULT 0 CHECK (extra_users >= 0),
    razorpay_subscription_id TEXT,
    razorpay_customer_id     TEXT,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_rzp ON public.subscriptions (razorpay_subscription_id);

-- ============================================================
-- RLS: a user reads their own subscription. All writes are server-side
-- (service role), matching meta_connections / storage_purchases.
-- ============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own subscription" ON public.subscriptions;
CREATE POLICY "Users view own subscription" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);
