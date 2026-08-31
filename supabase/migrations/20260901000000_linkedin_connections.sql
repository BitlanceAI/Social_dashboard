-- ============================================================
-- LinkedIn publishing
--
-- A separate per-provider connection table, following the
-- google_oauth_tokens precedent rather than generalising
-- meta_connections. The working Meta path must not shift under
-- this change, so meta_connections is left exactly as it is.
--
-- scheduled_posts becomes multi-provider: `provider` discriminates,
-- and exactly one of the two connection FKs is set per row.
--
-- DEPLOY ORDER: run and verify this migration BEFORE deploying any
-- server code that writes provider='linkedin'.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.linkedin_connections (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 'sub' from /v2/userinfo. Member ids are app-scoped: the same person
    -- has a different id in a different LinkedIn app.
    linkedin_user_id   TEXT,
    -- urn:li:person:{sub} -- the author URN used on every post
    author_urn         TEXT,
    display_name       TEXT,
    avatar_url         TEXT,

    -- aes-256-cbc, via shared/utils/encryption.js
    access_token       TEXT NOT NULL,
    -- LinkedIn issues refresh tokens only to approved Marketing Developer
    -- Platform partners. For everyone else this stays NULL forever, and the
    -- app must behave correctly when it does.
    refresh_token      TEXT,
    -- 60 days from issue, with no silent renewal. This column is the entire
    -- expiry story: the UI reads it directly and the scheduler prechecks it.
    token_expires_at   TIMESTAMPTZ,

    -- What the member actually granted. Posting as an organization stays
    -- dormant until rw_organization_admin appears here.
    granted_scopes     JSONB DEFAULT '[]'::jsonb,
    -- Organizations the member administers; [] keeps the org path dormant.
    organizations      JSONB DEFAULT '[]'::jsonb,
    -- NULL = not chosen yet (mirrors meta_connections.selected_page_ids)
    selected_org_ids   JSONB DEFAULT NULL,

    -- One nudge per approaching expiry, not one per scheduler tick
    expiry_notified_at TIMESTAMPTZ,

    is_active          BOOLEAN DEFAULT true,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_connections_linkedin_user_id
    ON public.linkedin_connections (linkedin_user_id);

-- ============================================================
-- scheduled_posts -> multi-provider
-- ============================================================

ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta',
    ADD COLUMN IF NOT EXISTS linkedin_connection_id UUID
        REFERENCES public.linkedin_connections(id) ON DELETE CASCADE;

-- Every pre-existing row is Meta. The DEFAULT already covers them; this is
-- belt and braces for anything written between deploy and migration.
UPDATE public.scheduled_posts SET provider = 'meta' WHERE provider IS NULL;

-- A LinkedIn row has no meta_connections parent.
ALTER TABLE public.scheduled_posts
    ALTER COLUMN meta_connection_id DROP NOT NULL;

ALTER TABLE public.scheduled_posts
    DROP CONSTRAINT IF EXISTS scheduled_posts_provider_check;
ALTER TABLE public.scheduled_posts
    ADD CONSTRAINT scheduled_posts_provider_check
    CHECK (provider IN ('meta', 'linkedin'));

-- The FK matching the provider must be present and the other absent.
-- scheduled_posts RLS is FOR ALL for the browser (unlike meta_connections,
-- which is SELECT-only), so the anon key can insert rows directly -- this
-- constraint is a real integrity guard, not documentation.
ALTER TABLE public.scheduled_posts
    DROP CONSTRAINT IF EXISTS scheduled_posts_provider_fk_check;
ALTER TABLE public.scheduled_posts
    ADD CONSTRAINT scheduled_posts_provider_fk_check CHECK (
        (provider = 'meta'
            AND meta_connection_id IS NOT NULL
            AND linkedin_connection_id IS NULL)
     OR (provider = 'linkedin'
            AND linkedin_connection_id IS NOT NULL
            AND meta_connection_id IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_linkedin_connection
    ON public.scheduled_posts (linkedin_connection_id);

-- ============================================================
-- Row Level Security
-- The server uses the service_role key and bypasses these; the policy
-- constrains what the browser (anon key) can read. Matches the
-- meta_connections style: SELECT only, never write from the client.
-- ============================================================

ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own linkedin connection" ON public.linkedin_connections;
CREATE POLICY "Users view own linkedin connection" ON public.linkedin_connections
    FOR SELECT USING (auth.uid() = user_id);
