-- ============================================================
-- Multi-workspace support — PART 2 of 2, TIGHTENING
--
-- Run this ONLY AFTER the workspace-aware server is deployed. It drops the
-- constraints the old server depended on, so applying it early takes the
-- running app down.
--
-- Preflight — all three must return 0:
--   SELECT count(*) FROM meta_connections     WHERE workspace_id IS NULL;
--   SELECT count(*) FROM linkedin_connections WHERE workspace_id IS NULL;
--   SELECT count(*) FROM scheduled_posts      WHERE workspace_id IS NULL;
-- ============================================================

-- The old server upserted with onConflict:'user_id'. The new one uses
-- workspace_id, and holding both would cap a user at one connection across all
-- their workspaces — the very thing this feature removes.
ALTER TABLE public.meta_connections
    DROP CONSTRAINT IF EXISTS meta_connections_user_id_key;

ALTER TABLE public.linkedin_connections
    DROP CONSTRAINT IF EXISTS linkedin_connections_user_id_key;

ALTER TABLE public.meta_connections
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.linkedin_connections
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.scheduled_posts
    ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================
-- Drop the rollout-only NULL branch now that the column is NOT NULL
-- ============================================================

DROP POLICY IF EXISTS "Members view the workspace meta connection" ON public.meta_connections;
CREATE POLICY "Members view the workspace meta connection" ON public.meta_connections
    FOR SELECT USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members view the workspace linkedin connection" ON public.linkedin_connections;
CREATE POLICY "Members view the workspace linkedin connection" ON public.linkedin_connections
    FOR SELECT USING (public.is_workspace_member(workspace_id));

-- ============================================================
-- scheduled_posts: FOR ALL -> SELECT only
--
-- The old policy let the browser (anon key) INSERT and UPDATE rows directly,
-- which under multi-tenancy would let anyone forge a row into another
-- workspace. The client never writes this table — verified: the only direct
-- table access anywhere in client/src is a user_credits read — so dropping to
-- SELECT closes the hole completely rather than partially.
-- ============================================================

DROP POLICY IF EXISTS "Users manage own scheduled posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "Members read workspace posts" ON public.scheduled_posts;
CREATE POLICY "Members read workspace posts" ON public.scheduled_posts
    FOR SELECT USING (public.is_workspace_member(workspace_id));
