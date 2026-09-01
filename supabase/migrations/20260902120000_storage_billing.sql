-- ============================================================
-- Paid media storage
--
-- Users buy storage (GB × months) for post media through Razorpay.
-- Admins set the price and the post-expiry delete window from the
-- admin panel; both live in the single-row storage_settings table.
--
-- Money is stored in the currency's minor unit (paise for INR),
-- matching what Razorpay's order API expects.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storage_settings (
    -- Single-row table: the CHECK pins the only possible id.
    id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- Price of 1 GB for 1 month, in minor units (default ₹50.00)
    price_per_gb_month INTEGER NOT NULL DEFAULT 5000 CHECK (price_per_gb_month > 0),
    currency           TEXT NOT NULL DEFAULT 'INR',
    -- Days after a plan expires before its media may be deleted
    delete_after_days  INTEGER NOT NULL DEFAULT 30 CHECK (delete_after_days >= 0),
    updated_by         UUID REFERENCES auth.users(id),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.storage_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.storage_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gb                  INTEGER NOT NULL CHECK (gb > 0),
    months              INTEGER NOT NULL CHECK (months BETWEEN 1 AND 24),
    -- Total charged, in minor units; computed server-side from settings
    amount              INTEGER NOT NULL CHECK (amount > 0),
    currency            TEXT NOT NULL DEFAULT 'INR',
    razorpay_order_id   TEXT NOT NULL UNIQUE,
    razorpay_payment_id TEXT,
    status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed')),
    -- Set when the payment verifies; entitlement runs starts_at → expires_at
    starts_at           TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_purchases_user_id
    ON public.storage_purchases (user_id);

CREATE INDEX IF NOT EXISTS idx_storage_purchases_active
    ON public.storage_purchases (expires_at)
    WHERE status = 'paid';

-- ============================================================
-- Row Level Security
-- All writes go through the server (service role). The browser may
-- read its own purchase history; settings are server-only, because
-- the price the client shows must be the price the server charges.
-- ============================================================

ALTER TABLE public.storage_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own storage purchases" ON public.storage_purchases;
CREATE POLICY "Users view own storage purchases" ON public.storage_purchases
    FOR SELECT USING (auth.uid() = user_id);
