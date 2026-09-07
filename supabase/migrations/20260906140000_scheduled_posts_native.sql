-- ============================================================
-- Native Facebook scheduling.
--
-- A Facebook-only post can be handed to Meta directly (scheduled_publish_time),
-- so Meta holds and publishes it regardless of our server's uptime. Those rows
-- get status 'scheduled' — distinct from 'pending', which our own scheduler
-- claims and publishes. The scheduler only ever processes 'pending', so a
-- 'scheduled' row is never double-published.
--
-- Instagram has no scheduling API, so IG (and FB+IG) posts stay 'pending' and
-- keep using the server-side scheduler.
-- ============================================================

ALTER TABLE public.scheduled_posts
    DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;

ALTER TABLE public.scheduled_posts
    ADD CONSTRAINT scheduled_posts_status_check
    CHECK (status IN ('pending', 'processing', 'scheduled', 'published', 'failed', 'cancelled'));
