-- Baseline schema for the Meta-only application.
--
-- Already applied to the remote database. Recreated here so the CLI's local
-- migration list matches remote history.
--
-- Safe to re-run: every statement is guarded.

-- ============================================================
-- users — application profile mirrored from auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT,
    name       TEXT,
    role       TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- user_credits — balance shown in the dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credits (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance    INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- blog_profiles — author profiles behind /api/profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blog_profiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    role          TEXT,
    bio           TEXT,
    profile_image TEXT,
    social_links  JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_profiles_user_id
    ON public.blog_profiles (user_id);

-- ============================================================
-- meta_connections — one connected Meta account per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_connections (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_type  TEXT NOT NULL CHECK (connection_type IN ('oauth', 'api_key')),
    -- App-scoped Meta user id, used by the deauthorize / data-deletion callbacks
    meta_user_id     TEXT,
    access_token     TEXT NOT NULL,          -- encrypted (aes-256-cbc)
    app_id           TEXT,
    app_secret       TEXT,                   -- encrypted
    token_expires_at TIMESTAMPTZ,
    pages            JSONB DEFAULT '[]'::jsonb,
    ad_accounts      JSONB DEFAULT '[]'::jsonb,
    whatsapp_phone_id TEXT,
    waba_id          TEXT,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_meta_user_id
    ON public.meta_connections (meta_user_id);

-- ============================================================
-- scheduled_posts — the publishing queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meta_connection_id UUID NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
    page_id           TEXT NOT NULL,
    page_name         TEXT,
    platforms         JSONB DEFAULT '["facebook"]'::jsonb,
    content           TEXT NOT NULL,
    media_urls        JSONB DEFAULT '[]'::jsonb,
    link_url          TEXT,
    scheduled_time    TIMESTAMPTZ NOT NULL,
    timezone          TEXT DEFAULT 'UTC',
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'published', 'failed', 'cancelled')),
    meta_post_id      TEXT,
    publish_results   JSONB DEFAULT '{}'::jsonb,
    error_message     TEXT,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id
    ON public.scheduled_posts (user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending_due
    ON public.scheduled_posts (scheduled_time)
    WHERE status = 'pending';

-- ============================================================
-- Row Level Security
-- The server uses the service_role key and bypasses RLS; these policies
-- constrain what the browser (anon key) can read.
-- ============================================================
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own row" ON public.users;
CREATE POLICY "Users read own row" ON public.users
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users view own credits" ON public.user_credits;
CREATE POLICY "Users view own credits" ON public.user_credits
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own profiles" ON public.blog_profiles;
CREATE POLICY "Users manage own profiles" ON public.blog_profiles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own meta connection" ON public.meta_connections;
CREATE POLICY "Users view own meta connection" ON public.meta_connections
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users manage own scheduled posts" ON public.scheduled_posts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Storage — post media must be publicly readable, because Meta fetches
-- images and video by URL rather than accepting a direct upload.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read post-media" ON storage.objects;
CREATE POLICY "Public read post-media" ON storage.objects
    FOR SELECT USING (bucket_id = 'post-media');

-- ============================================================
-- New-signup bootstrap
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data ->> 'role', 'user')
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_credits (user_id, balance)
    VALUES (NEW.id, 5000)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
