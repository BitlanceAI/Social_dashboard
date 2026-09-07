-- ============================================================
-- Graphic templates (ported from the Mongoose GraphicTemplate model)
--
-- A template holds a fixed, hand-written image prompt with {{token}}
-- placeholders plus dynamic_fields describing each token. Everything not a
-- placeholder (concept, composition, palette, camera, negative prompt) is
-- intentionally fixed — that is what makes one template differ from another.
--
-- Mongoose → Postgres type mapping:
--   dynamic_fields ([{key,label,type,default}])  → JSONB array
--   tags / mood (String[])                        → TEXT[]
--   key (unique slug, e.g. "re-01")               → TEXT UNIQUE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.graphic_templates (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key            TEXT NOT NULL UNIQUE,              -- stable slug, e.g. "re-01"
    number         INTEGER NOT NULL,
    title          TEXT NOT NULL,
    niche          TEXT NOT NULL DEFAULT 'real_estate',
    tags           TEXT[] NOT NULL DEFAULT '{}',
    mood           TEXT[] NOT NULL DEFAULT '{}',
    canvas_size    TEXT NOT NULL DEFAULT '1080x1350',
    thumbnail_url  TEXT,
    -- [{ key, label, type: 'text'|'textarea', default }]
    dynamic_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Full prompt text with {{token}} placeholders for each dynamic_fields.key.
    prompt_template TEXT NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graphic_templates_niche_active
    ON public.graphic_templates (niche, is_active);
-- GIN index for tag filtering (tags @> '{...}')
CREATE INDEX IF NOT EXISTS idx_graphic_templates_tags
    ON public.graphic_templates USING GIN (tags);

-- ============================================================
-- RLS: the gallery is browsed in the composer, so ACTIVE templates are
-- public-readable. All writes (seed, admin create/edit) go through the
-- server's service-role key, matching the other admin-managed tables.
-- ============================================================

ALTER TABLE public.graphic_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active templates" ON public.graphic_templates;
CREATE POLICY "Anyone can read active templates" ON public.graphic_templates
    FOR SELECT USING (is_active = true);
