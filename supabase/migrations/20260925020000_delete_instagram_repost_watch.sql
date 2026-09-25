-- Delete a watch and its imported posts while preserving delivery history.
-- Pending deliveries must be cancelled before source rows cascade away.
CREATE OR REPLACE FUNCTION public.delete_instagram_repost_watch(p_watch_id uuid, p_workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    watch_row instagram_repost_watches%ROWTYPE;
BEGIN
    SELECT * INTO watch_row FROM instagram_repost_watches
     WHERE id = p_watch_id AND workspace_id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;

    IF watch_row.run_claimed_until > now() OR watch_row.approval_claimed_until > now() THEN
        RAISE EXCEPTION 'A watch check is running. Try deleting it again after the check finishes.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
        SELECT 1 FROM scheduled_posts d
        JOIN instagram_repost_posts p ON p.id = d.repost_source_post_id
        WHERE p.watch_id = p_watch_id AND d.status = 'processing'
    ) THEN
        RAISE EXCEPTION 'A repost is publishing. Try deleting the watch after publishing finishes.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE scheduled_posts d SET status = 'cancelled'
      FROM instagram_repost_posts p
     WHERE p.id = d.repost_source_post_id AND p.watch_id = p_watch_id
       AND d.workspace_id = p_workspace_id AND d.status IN ('pending', 'pending_approval');
    DELETE FROM instagram_repost_watches WHERE id = p_watch_id AND workspace_id = p_workspace_id;
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_instagram_repost_watch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_instagram_repost_watch(uuid, uuid) TO service_role;
