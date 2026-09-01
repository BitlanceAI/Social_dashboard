-- ============================================================
-- Fix: create_workspace failed with "requires an authenticated user"
-- when called through the server.
--
-- The server calls every RPC with the service-role client (the
-- pattern this module uses throughout), and service-role requests
-- carry no user JWT — auth.uid() is NULL there. The sibling
-- ensure_default_workspace(p_user) already takes the user id as a
-- parameter for exactly this reason; create_workspace now does too.
--
-- Security shape: v_user := COALESCE(auth.uid(), p_user). A browser
-- caller (authenticated role) always acts as themselves — a passed
-- p_user cannot override their own auth.uid(). Only the service role
-- (no JWT, id verified by the server's auth middleware) reaches the
-- p_user fallback.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_workspace(TEXT);

CREATE OR REPLACE FUNCTION public.create_workspace(p_name TEXT, p_user UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_user UUID := COALESCE(auth.uid(), p_user);
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'create_workspace requires an authenticated user';
    END IF;

    INSERT INTO public.workspaces (name, owner_id)
    VALUES (NULLIF(btrim(p_name), ''), v_user)
    RETURNING id INTO v_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_id, v_user, 'owner');

    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_workspace(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, UUID) TO authenticated, service_role;
