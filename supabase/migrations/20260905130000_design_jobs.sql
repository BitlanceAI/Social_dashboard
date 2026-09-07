-- ============================================================
-- Design jobs (ported from the Mongoose DesignJob model — itself originally
-- migrated FROM a Supabase design_jobs table, so this brings it home).
--
-- One row per flyer / social-post AI generation. The Mongoose schema was
-- `strict: false` (arbitrary extra fields); in Postgres those overflow into
-- the `metadata` JSONB column instead.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.design_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Real-estate / offer inputs (all optional; templates decide which apply)
    property_type  TEXT,
    location       TEXT,
    price          TEXT,
    builder        TEXT,
    phone          TEXT,
    email          TEXT,
    address        TEXT,

    -- Output + composed content
    flyer_url      TEXT,
    background_url TEXT,
    title          TEXT,
    subline        TEXT,
    amenities      JSONB NOT NULL DEFAULT '[]'::jsonb,
    cta            TEXT,

    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message  TEXT,
    credits_used   INTEGER NOT NULL DEFAULT 0,
    -- Overflow for the Mongoose strict:false extras + template/job context.
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,

    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_jobs_user_created
    ON public.design_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_jobs_status
    ON public.design_jobs (status);

-- ============================================================
-- RLS: a user reads their own jobs; the server (service role) creates and
-- updates them, matching scheduled_posts / storage_purchases.
-- ============================================================

ALTER TABLE public.design_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own design jobs" ON public.design_jobs;
CREATE POLICY "Users view own design jobs" ON public.design_jobs
    FOR SELECT USING (auth.uid() = user_id);
