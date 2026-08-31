-- ============================================================
-- Multi-workspace (multi-tenant) support — PART 1 of 2, ADDITIVE ONLY
--
-- An agency needs several isolated workspaces, each owning its own connected
-- social accounts and posting queue, shared by a team. Today both connection
-- tables carry UNIQUE (user_id), so one person can hold exactly one Meta and
-- one LinkedIn account.
--
-- This migration adds the workspace tables, backfills every existing user into
-- a personal workspace, and adds a NULLABLE workspace_id to the three scoped
-- tables. It deliberately does NOT drop UNIQUE (user_id) or set anything NOT
-- NULL — the currently deployed server upserts with onConflict:'user_id' and
-- would break the moment that constraint disappears.
--
-- DEPLOY ORDER: this migration -> deploy the server -> then the _tighten
-- migration. Each step is safe on its own.
-- ============================================================

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspaces (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    -- RESTRICT, not CASCADE: deleting a user must not silently destroy a
    -- workspace their teammates are still working in. Transfer ownership first.
    owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'admin', 'member')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
    ON public.workspace_members (user_id);

CREATE TABLE IF NOT EXISTS public.workspace_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    -- sha256 of the invite token. The raw token is returned to the inviter once
    -- and never stored, so a database leak cannot be used to join a workspace.
    token_hash   TEXT NOT NULL UNIQUE,
    invited_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    accepted_at  TIMESTAMPTZ,
    accepted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- One open invite per email per workspace; accepted ones may pile up as history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_invite
    ON public.workspace_invites (workspace_id, lower(email))
    WHERE accepted_at IS NULL;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS default_workspace_id UUID
        REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- ============================================================
-- Scope columns — nullable for now
-- ============================================================

ALTER TABLE public.meta_connections
    ADD COLUMN IF NOT EXISTS workspace_id UUID
        REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.linkedin_connections
    ADD COLUMN IF NOT EXISTS workspace_id UUID
        REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS workspace_id UUID
        REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_workspace
    ON public.scheduled_posts (workspace_id);

-- ============================================================
-- Backfill
--
-- Driven from auth.users, NOT public.users. The handle_new_user trigger only
-- fires for signups made after it was installed, so public.users can be missing
-- rows — and a missing row here means a connection with a NULL workspace_id
-- that the tighten migration would then refuse to make NOT NULL.
-- ============================================================

INSERT INTO public.workspaces (name, owner_id)
SELECT
    COALESCE(p.name, split_part(au.email, '@', 1), 'My') || '''s Workspace',
    au.id
FROM auth.users au
LEFT JOIN public.users p ON p.id = au.id
WHERE NOT EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.owner_id = au.id
);

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, w.owner_id, 'owner'
FROM public.workspaces w
ON CONFLICT DO NOTHING;

-- Ensure every auth user has a public.users row before we stamp the default.
INSERT INTO public.users (id, email)
SELECT au.id, au.email
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = au.id)
ON CONFLICT (id) DO NOTHING;

UPDATE public.users u
SET default_workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_id = u.id AND u.default_workspace_id IS NULL;

UPDATE public.meta_connections c
SET workspace_id = u.default_workspace_id
FROM public.users u
WHERE u.id = c.user_id AND c.workspace_id IS NULL;

UPDATE public.linkedin_connections c
SET workspace_id = u.default_workspace_id
FROM public.users u
WHERE u.id = c.user_id AND c.workspace_id IS NULL;

UPDATE public.scheduled_posts p
SET workspace_id = u.default_workspace_id
FROM public.users u
WHERE u.id = p.user_id AND p.workspace_id IS NULL;

-- ============================================================
-- Uniqueness moves to the workspace
--
-- The WORKSPACE owns one Meta account and one LinkedIn account, shared by its
-- members; user_id degrades to "who connected it". Scoping to
-- (workspace_id, user_id) instead would let two members each connect their own
-- account into one workspace, making loadConnection's .single() ambiguous —
-- the exact blocker this migration exists to remove.
--
-- NULLs do not collide in a Postgres unique index, which is what makes these
-- safe to create while the rollout window still has unscoped rows.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_workspace_uniq
    ON public.meta_connections (workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS linkedin_connections_workspace_uniq
    ON public.linkedin_connections (workspace_id);

-- ============================================================
-- Membership helpers
--
-- SECURITY DEFINER is load-bearing, not decoration. A policy ON
-- workspace_members that SELECTs workspace_members recurses and fails with
-- 42P17. These functions run as their owner, and a table owner is exempt from
-- RLS on its own tables, which breaks the cycle.
--
-- Two things must stay true or the recursion returns:
--   1. Never ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY — that
--      revokes the owner exemption.
--   2. SET search_path is mandatory on SECURITY DEFINER (search-path
--      hijacking). handle_new_user already does this; follow it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_workspace_member(w UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = w AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.workspace_role(w UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.role FROM public.workspace_members m
    WHERE m.workspace_id = w AND m.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workspace_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_role(UUID) TO authenticated;

-- ============================================================
-- Default-workspace resolution
--
-- ONE implementation, two callers: the signup trigger and the server's lazy
-- fallback in resolveWorkspace. Two copies would race and diverge.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_default_workspace(p_user UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT default_workspace_id INTO v_id FROM public.users WHERE id = p_user;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    -- Already a member of something (e.g. joined by invite before ever
    -- owning a workspace)? Adopt the oldest as the default.
    SELECT workspace_id INTO v_id
    FROM public.workspace_members
    WHERE user_id = p_user
    ORDER BY created_at
    LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO public.workspaces (name, owner_id)
        VALUES (
            COALESCE((SELECT split_part(email, '@', 1) FROM auth.users WHERE id = p_user), 'My')
                || '''s Workspace',
            p_user
        )
        RETURNING id INTO v_id;

        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        VALUES (v_id, p_user, 'owner')
        ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.users SET default_workspace_id = v_id WHERE id = p_user;
    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_default_workspace(UUID) FROM PUBLIC;

-- Creating a workspace must be atomic: supabase-js has no transactions, and a
-- workspaces row without its owner membership row is permanently unreachable
-- (the RLS predicate can never be satisfied by anyone).
CREATE OR REPLACE FUNCTION public.create_workspace(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_user UUID := auth.uid();
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

REVOKE EXECUTE ON FUNCTION public.create_workspace(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO authenticated;

-- Every new signup gets a workspace, same as the backfill gave existing users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        'user'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_credits (user_id, balance)
    VALUES (NEW.id, 5000)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM public.ensure_default_workspace(NEW.id);

    RETURN NEW;
END;
$$;

-- ============================================================
-- Row Level Security
--
-- The browser gets read-only access everywhere; every mutation goes through the
-- server's service-role key. That is already the pattern for meta_connections
-- and linkedin_connections.
-- ============================================================

ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their workspaces" ON public.workspaces;
CREATE POLICY "Members read their workspaces" ON public.workspaces
    FOR SELECT USING (public.is_workspace_member(id));

-- The user_id disjunct is a fast path AND the reason this policy is
-- self-consistent: a member can always see their own row without a lookup.
DROP POLICY IF EXISTS "Members read the roster" ON public.workspace_members;
CREATE POLICY "Members read the roster" ON public.workspace_members
    FOR SELECT USING (
        user_id = auth.uid() OR public.is_workspace_member(workspace_id)
    );

-- workspace_invites gets NO policy at all. RLS is enabled and nothing grants
-- access, so the anon key can never read token hashes. Server-only by design.

-- The workspace_id IS NULL branch keeps the already-deployed client working
-- during the rollout window. The tighten migration removes it.
DROP POLICY IF EXISTS "Users view own meta connection" ON public.meta_connections;
DROP POLICY IF EXISTS "Members view the workspace meta connection" ON public.meta_connections;
CREATE POLICY "Members view the workspace meta connection" ON public.meta_connections
    FOR SELECT USING (
        public.is_workspace_member(workspace_id)
        OR (workspace_id IS NULL AND auth.uid() = user_id)
    );

DROP POLICY IF EXISTS "Users view own linkedin connection" ON public.linkedin_connections;
DROP POLICY IF EXISTS "Members view the workspace linkedin connection" ON public.linkedin_connections;
CREATE POLICY "Members view the workspace linkedin connection" ON public.linkedin_connections
    FOR SELECT USING (
        public.is_workspace_member(workspace_id)
        OR (workspace_id IS NULL AND auth.uid() = user_id)
    );
