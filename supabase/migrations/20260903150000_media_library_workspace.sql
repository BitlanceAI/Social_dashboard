-- ============================================================
-- Scope the media library to a workspace.
--
-- A file uploaded while working in workspace A must not surface in
-- workspace B: list and upload are filtered on (user_id, workspace_id).
-- NULL workspace_id = personal/legacy uploads, visible only when no
-- workspace header is sent. Quota stays per-user — the purchase belongs
-- to the person, the files to the workspace they were uploaded in.
-- ============================================================

ALTER TABLE public.media_library
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_media_library_workspace
    ON public.media_library (workspace_id);
