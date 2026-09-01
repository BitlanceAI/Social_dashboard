-- ============================================================
-- Media library — files a user keeps in their purchased storage
-- and reuses across posts.
--
-- Objects live in the public post-media bucket under
-- library/{user_id}/…; this table is the accounting layer that the
-- quota check (size_bytes vs purchased GB) and the future
-- post-expiry purge both read.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.media_library (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL UNIQUE,
    url        TEXT NOT NULL,
    file_name  TEXT NOT NULL,
    mime_type  TEXT,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_library_user_id
    ON public.media_library (user_id);

-- Server-only writes (service role); the browser may read its own rows.
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own media" ON public.media_library;
CREATE POLICY "Users view own media" ON public.media_library
    FOR SELECT USING (auth.uid() = user_id);
