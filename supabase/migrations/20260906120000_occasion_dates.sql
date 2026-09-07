-- ============================================================
-- Occasion date entries — the admin-editable half of the occasion calendar.
--
-- The static rules (FIXED / NTH_WEEKDAY) live in
-- server/src/shared/utils/occasionDates.js. This table holds what code
-- cannot know:
--   * verified per-year dates for MOVABLE occasions (Diwali, Eid, Holi …),
--     entered by an admin from a panchang or official holiday list;
--   * corrections that override a static rule for one year;
--   * entirely new occasions an admin adds (any slug not in the static file).
--
-- One row per (slug, year). A row always wins over the static resolver.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.occasion_dates (
    slug        TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    year        INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    date        DATE NOT NULL,
    name        TEXT,                 -- display label; only needed for admin-added slugs
    notes       TEXT,                 -- e.g. the panchang / source the date was verified against
    -- 'rule'  = seeded from the static FIXED / NTH_WEEKDAY tables in
    --           shared/utils/occasionDates.js (see scripts/seed-occasion-dates.mjs).
    --           Editable, but it is not yet a human decision.
    -- 'admin' = a person entered or overrode this date. Never overwritten by a reseed.
    source      TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('rule', 'admin')),
    updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (slug, year),
    -- The stored date must fall inside the row's year.
    CONSTRAINT occasion_date_in_year CHECK (EXTRACT(YEAR FROM date)::integer = year)
);

CREATE INDEX IF NOT EXISTS occasion_dates_date_idx ON public.occasion_dates (date);

-- ============================================================
-- RLS: readable by any signed-in user (the calendar is not sensitive);
-- writes go through the server's service-role key only (admin routes).
-- ============================================================

ALTER TABLE public.occasion_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read occasion dates" ON public.occasion_dates;
CREATE POLICY "Authenticated users can read occasion dates" ON public.occasion_dates
    FOR SELECT TO authenticated USING (true);

-- Backfill for a table created before `source` existed: every pre-existing row
-- was hand-entered, so the 'admin' default is already correct.
ALTER TABLE public.occasion_dates
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS occasion_dates_year_source_idx
    ON public.occasion_dates (year, source);
