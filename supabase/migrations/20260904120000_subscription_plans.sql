-- ============================================================
-- Subscription plan catalog
--
-- The tiers shown on /pricing and enforced across the app. Admin-editable
-- (prices, limits, features) so pricing can change without a deploy. Money is
-- in the currency's minor unit (paise), matching storage_settings.
--
-- Each tier maps to Razorpay Plan ids (one per interval); those are created in
-- Razorpay separately and pasted in by an admin. NULL limit = unlimited.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    plan_key                 TEXT PRIMARY KEY,          -- starter | growth | agency
    name                     TEXT NOT NULL,
    tagline                  TEXT,
    monthly_price            INTEGER NOT NULL CHECK (monthly_price >= 0),   -- paise
    yearly_price             INTEGER NOT NULL CHECK (yearly_price >= 0),    -- paise
    currency                 TEXT NOT NULL DEFAULT 'INR',
    included_accounts        INTEGER,                    -- NULL = unlimited
    included_users           INTEGER,
    included_workspaces      INTEGER,
    daily_post_limit         INTEGER,                    -- per account, per day
    features                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[] of bullet copy
    highlighted              BOOLEAN NOT NULL DEFAULT false,      -- the "recommended" tier
    razorpay_plan_id_monthly TEXT,
    razorpay_plan_id_yearly  TEXT,
    is_active                BOOLEAN NOT NULL DEFAULT true,
    sort_order               INTEGER NOT NULL DEFAULT 0,
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the three self-serve tiers (Enterprise is "contact sales", not a row).
-- Prices are the proposed INR benchmark, in paise.
INSERT INTO public.subscription_plans
    (plan_key, name, tagline, monthly_price, yearly_price,
     included_accounts, included_users, included_workspaces, daily_post_limit,
     features, highlighted, sort_order)
VALUES
    ('starter', 'Starter', 'For an individual running their own accounts.',
     49900, 499000, 3, 1, 1, 10,
     '["Recurring and one-off scheduling","Post history from Meta","Basic analytics","Composer with media library"]'::jsonb,
     false, 1),
    ('growth', 'Growth', 'For creators and small teams scaling up.',
     149900, 1499000, 10, 3, 3, 25,
     '["Everything in Starter","Comment management (reply / hide / delete)","Full media library + reuse","Best-time scheduling","Up to 3 workspaces"]'::jsonb,
     true, 2),
    ('agency', 'Agency', 'For agencies running many client accounts.',
     399900, 3999000, 30, 10, NULL, 80,
     '["Everything in Growth","Unlimited workspaces","White-label analytics","Approval workflows","Priority support"]'::jsonb,
     false, 3)
ON CONFLICT (plan_key) DO NOTHING;

-- ============================================================
-- RLS: the catalog is PUBLIC-READABLE (the pricing page shows it without a
-- login). Writes go through the server's service-role key only.
-- ============================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read active plans" ON public.subscription_plans
    FOR SELECT USING (is_active = true);
