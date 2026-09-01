-- One nudge per lapse, not one per daily sweep: stamped on the user's most
-- recent paid purchase when the grace-window push goes out. A renewal creates
-- a new purchase row, so the next lapse notifies afresh.
-- (Same pattern as linkedin_connections.expiry_notified_at.)

ALTER TABLE public.storage_purchases
    ADD COLUMN IF NOT EXISTS grace_notified_at TIMESTAMPTZ;
