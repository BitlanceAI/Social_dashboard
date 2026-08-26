-- Let users choose which Facebook Pages (and their linked Instagram accounts)
-- to actually connect, instead of importing every Page they manage.
--
-- `pages` keeps the full list returned by Meta — we need it to render the
-- picker and to refresh page access tokens. `selected_page_ids` is the subset
-- the user opted into; everything else in the app reads only that subset.
--
-- NULL means "not chosen yet" and triggers the picker. An empty array is a
-- deliberate choice of nothing, and is left alone.

ALTER TABLE public.meta_connections
    ADD COLUMN IF NOT EXISTS selected_page_ids JSONB DEFAULT NULL;

-- Existing connections imported every Page, so treat them all as selected
-- rather than suddenly showing those users an empty dashboard.
UPDATE public.meta_connections
SET selected_page_ids = (
    SELECT COALESCE(jsonb_agg(p ->> 'id'), '[]'::jsonb)
    FROM jsonb_array_elements(pages) AS p
)
WHERE selected_page_ids IS NULL
  AND pages IS NOT NULL
  AND jsonb_typeof(pages) = 'array';
