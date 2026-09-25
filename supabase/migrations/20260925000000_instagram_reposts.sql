-- Instagram source discovery is separate from scheduled_posts delivery state.
CREATE TABLE public.instagram_repost_watches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_handle text NOT NULL CHECK (source_handle ~ '^[a-z0-9._]{1,30}$'),
    targets jsonb NOT NULL DEFAULT '[]'::jsonb,
    mode text NOT NULL DEFAULT 'review' CHECK (mode IN ('review', 'automatic', 'approval')),
    approver_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
    checks_per_day integer NOT NULL DEFAULT 1 CHECK (checks_per_day BETWEEN 1 AND 12),
    scrape_limit integer NOT NULL DEFAULT 24 CHECK (scrape_limit BETWEEN 1 AND 100),
    gap_minutes integer NOT NULL DEFAULT 60 CHECK (gap_minutes BETWEEN 0 AND 1440),
    active boolean NOT NULL DEFAULT true,
    last_run_at timestamptz,
    last_run_status text,
    last_run_error text,
    last_run_new_posts integer NOT NULL DEFAULT 0,
    last_seen_posted_at timestamptz,
    last_seen_shortcode text,
    run_claimed_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, source_handle)
);

CREATE TABLE public.instagram_repost_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    watch_id uuid NOT NULL REFERENCES public.instagram_repost_watches(id) ON DELETE CASCADE,
    shortcode text NOT NULL,
    permalink text,
    caption text NOT NULL DEFAULT '',
    media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'carousel')),
    original_media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
    media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
    posted_at timestamptz,
    state text NOT NULL DEFAULT 'imported' CHECK (state IN ('imported', 'media_failed', 'queued', 'skipped')),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (watch_id, shortcode)
);

CREATE INDEX instagram_repost_watches_due_idx ON public.instagram_repost_watches (last_run_at) WHERE active;
CREATE INDEX instagram_repost_posts_watch_idx ON public.instagram_repost_posts (watch_id, posted_at DESC);
ALTER TABLE public.scheduled_posts ADD COLUMN repost_source_post_id uuid REFERENCES public.instagram_repost_posts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX scheduled_posts_repost_source_target_idx ON public.scheduled_posts (repost_source_post_id, page_id) WHERE repost_source_post_id IS NOT NULL;

-- Atomic lease works across multiple server instances and manual runs.
CREATE OR REPLACE FUNCTION public.claim_instagram_repost_watch(p_watch_id uuid, p_force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE instagram_repost_watches
       SET run_claimed_until = now() + interval '7 minutes'
     WHERE id = p_watch_id AND active
       AND (run_claimed_until IS NULL OR run_claimed_until < now())
       AND (p_force OR last_run_at IS NULL OR last_run_at <= now() - (interval '1 day' / checks_per_day));
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_instagram_repost_watch(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_instagram_repost_watch(uuid, boolean) TO service_role;

ALTER TABLE public.instagram_repost_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_repost_posts ENABLE ROW LEVEL SECURITY;
-- All access goes through the authenticated, workspace-scoped server API.
