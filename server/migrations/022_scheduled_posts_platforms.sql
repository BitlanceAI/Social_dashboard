-- Multi-platform publishing for scheduled_posts
-- Adds Instagram support alongside Facebook Pages.
-- Run this in the Supabase SQL Editor.

-- Which Meta surfaces a scheduled post targets.
-- Existing rows were Facebook-Page-only, so that is the backfill default.
ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS platforms JSONB DEFAULT '["facebook"]'::jsonb;

UPDATE public.scheduled_posts
SET platforms = '["facebook"]'::jsonb
WHERE platforms IS NULL;

-- Per-platform publish outcome, e.g.
-- {"facebook":{"success":true,"postId":"..."},"instagram":{"success":false,"error":"..."}}
ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS publish_results JSONB DEFAULT '{}'::jsonb;

-- The scheduler claims rows by flipping pending -> processing before publishing,
-- so this index keeps the per-minute tick cheap.
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending_due
    ON public.scheduled_posts (scheduled_time)
    WHERE status = 'pending';
