-- App-scoped Meta user id, needed for the Deauthorize and Data Deletion
-- callbacks: Meta identifies the person by this id in the signed_request,
-- not by our internal user_id.
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.meta_connections
    ADD COLUMN IF NOT EXISTS meta_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_meta_connections_meta_user_id
    ON public.meta_connections (meta_user_id);
