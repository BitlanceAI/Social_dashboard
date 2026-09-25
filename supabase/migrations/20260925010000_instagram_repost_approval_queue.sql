-- Serialize each watch's approval queue across webhooks and scheduler instances.
ALTER TABLE public.instagram_repost_watches
    ADD COLUMN IF NOT EXISTS approval_claimed_until timestamptz;
ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS repost_approval_attempted_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_instagram_repost_approval_watch(p_watch_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE instagram_repost_watches
       SET approval_claimed_until = now() + interval '15 minutes'
     WHERE id = p_watch_id AND active AND mode = 'approval'
       AND (approval_claimed_until IS NULL OR approval_claimed_until < now());
    RETURN FOUND;
END;
$$;

-- One source post is under review at a time. A post with an incomplete set of
-- destination deliveries is resumed before the next source post is selected.
CREATE OR REPLACE FUNCTION public.next_instagram_repost_approval_candidate(p_watch_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id
      FROM instagram_repost_posts p
      JOIN instagram_repost_watches w ON w.id = p.watch_id
      LEFT JOIN scheduled_posts d ON d.repost_source_post_id = p.id
     WHERE p.watch_id = p_watch_id AND w.active AND w.mode = 'approval'
       AND p.state IN ('imported', 'queued')
       AND NOT EXISTS (
           SELECT 1 FROM scheduled_posts pending
           JOIN instagram_repost_posts source ON source.id = pending.repost_source_post_id
           WHERE source.watch_id = p_watch_id AND pending.status = 'pending_approval'
       )
     GROUP BY p.id, p.posted_at, p.created_at, w.targets
    HAVING count(d.id) < jsonb_array_length(w.targets)
     ORDER BY p.posted_at ASC NULLS LAST, p.created_at ASC, p.id ASC
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pending_instagram_repost_approvals(p_watch_id uuid)
RETURNS SETOF public.scheduled_posts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.* FROM scheduled_posts d
    JOIN instagram_repost_posts p ON p.id = d.repost_source_post_id
    WHERE p.watch_id = p_watch_id AND d.status = 'pending_approval'
    ORDER BY d.created_at, d.id;
$$;

CREATE OR REPLACE FUNCTION public.last_instagram_repost_delivery_time(p_watch_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT max(d.scheduled_time) FROM scheduled_posts d
    JOIN instagram_repost_posts p ON p.id = d.repost_source_post_id
    WHERE p.watch_id = p_watch_id AND d.status <> 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.claim_instagram_repost_approval_watch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_instagram_repost_approval_candidate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pending_instagram_repost_approvals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.last_instagram_repost_delivery_time(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_instagram_repost_approval_watch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_instagram_repost_approval_candidate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pending_instagram_repost_approvals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.last_instagram_repost_delivery_time(uuid) TO service_role;
