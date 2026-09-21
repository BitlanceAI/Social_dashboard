-- Free admin grants share the storage entitlement and expiry lifecycle.
BEGIN;
ALTER TABLE public.storage_purchases
    ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES auth.users(id),
    ALTER COLUMN razorpay_order_id DROP NOT NULL;
ALTER TABLE public.storage_purchases DROP CONSTRAINT storage_purchases_amount_check;
ALTER TABLE public.storage_purchases DROP CONSTRAINT storage_purchases_status_check;
ALTER TABLE public.storage_purchases
    ADD CONSTRAINT storage_purchases_status_check CHECK (status IN ('created', 'paid', 'failed', 'granted')),
    ADD CONSTRAINT storage_purchases_amount_check CHECK (
        (status = 'granted' AND amount = 0 AND granted_by IS NOT NULL
            AND razorpay_order_id IS NULL AND razorpay_payment_id IS NULL
            AND starts_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > starts_at)
        OR (status <> 'granted' AND amount > 0 AND razorpay_order_id IS NOT NULL)
    );
CREATE INDEX IF NOT EXISTS idx_storage_purchases_grants_active
    ON public.storage_purchases (user_id, expires_at) WHERE status = 'granted';
-- Existing RLS remains read-only for users; only the service role writes grants.
COMMIT;
