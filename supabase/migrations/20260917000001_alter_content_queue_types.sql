-- Migration: Alter content_queue column types to TEXT to support long format and pillar descriptions
ALTER TABLE public.content_queue ALTER COLUMN format TYPE TEXT;
ALTER TABLE public.content_queue ALTER COLUMN content_pillar TYPE TEXT;
ALTER TABLE public.content_queue ALTER COLUMN day TYPE TEXT;
ALTER TABLE public.content_queue ALTER COLUMN date_str TYPE TEXT;
