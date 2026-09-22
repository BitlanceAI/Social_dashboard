-- Apply before deploying the independent Instagram Login provider.
BEGIN;
CREATE TABLE public.instagram_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 instagram_user_id text NOT NULL,
 username text NOT NULL,
 avatar_url text,
 access_token text NOT NULL,
 token_expires_at timestamptz NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, workspace_id)
);
CREATE INDEX instagram_connections_user ON public.instagram_connections(instagram_user_id);
-- Also enforce account identity under concurrent reconnect attempts.
CREATE FUNCTION public.preserve_instagram_connection_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.instagram_user_id IS DISTINCT FROM OLD.instagram_user_id THEN
   RAISE EXCEPTION 'Disconnect the existing Instagram account before connecting another one';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER instagram_connection_identity BEFORE UPDATE OF instagram_user_id
 ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.preserve_instagram_connection_identity();
-- Credentials are server-only. The API returns an explicit safe projection.
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_connections FROM anon, authenticated;
GRANT ALL ON public.instagram_connections TO service_role;

-- One-use OAuth states and handoff tickets. Only their hashes are stored.
CREATE TABLE public.instagram_oauth_states (
 state_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 verifier_hash text NOT NULL,
 phase text NOT NULL CHECK (phase IN ('authorize', 'complete')),
 expires_at timestamptz NOT NULL,
 credentials jsonb
);
CREATE INDEX instagram_oauth_states_expiry ON public.instagram_oauth_states(expires_at);
ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_oauth_states FROM anon, authenticated;
GRANT ALL ON public.instagram_oauth_states TO service_role;

ALTER TABLE public.scheduled_posts ADD COLUMN instagram_connection_id uuid;
ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_instagram_workspace_fk
 FOREIGN KEY (instagram_connection_id, workspace_id)
 REFERENCES public.instagram_connections(id, workspace_id) ON DELETE CASCADE;
CREATE INDEX scheduled_posts_instagram_connection ON public.scheduled_posts(instagram_connection_id);
ALTER TABLE public.scheduled_posts DROP CONSTRAINT scheduled_posts_provider_check;
ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_provider_check
 CHECK (provider IN ('meta', 'linkedin', 'instagram'));
ALTER TABLE public.scheduled_posts DROP CONSTRAINT scheduled_posts_provider_fk_check;
ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_provider_fk_check CHECK (
 (provider = 'meta' AND meta_connection_id IS NOT NULL AND linkedin_connection_id IS NULL AND instagram_connection_id IS NULL)
 OR (provider = 'linkedin' AND linkedin_connection_id IS NOT NULL AND meta_connection_id IS NULL AND instagram_connection_id IS NULL)
 OR (provider = 'instagram' AND instagram_connection_id IS NOT NULL AND meta_connection_id IS NULL AND linkedin_connection_id IS NULL
     AND platforms = '["instagram"]'::jsonb)
);

-- Include the direct Instagram account in the same serialized capacity check
-- as Facebook/LinkedIn, so simultaneous connections cannot bypass plan caps.
CREATE OR REPLACE FUNCTION public.enforce_subscription_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid; account_cap integer; workspace_cap integer; account_count integer; workspace_count integer;
BEGIN
 IF TG_TABLE_NAME = 'workspaces' THEN owner := NEW.owner_id;
 ELSE SELECT owner_id INTO owner FROM workspaces WHERE id = NEW.workspace_id;
 END IF;
 IF owner IS NULL THEN RAISE EXCEPTION 'Workspace owner is required'; END IF;
 IF public.is_billing_exempt(owner) THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text, 0));
 SELECT p.included_accounts + COALESCE(s.extra_accounts, 0), p.included_workspaces
 INTO account_cap, workspace_cap FROM subscription_plans p
 LEFT JOIN subscriptions s ON s.user_id = owner
 WHERE p.plan_key = COALESCE(s.plan_key, 'solo');
 IF TG_TABLE_NAME = 'workspaces' THEN
   SELECT count(*) INTO workspace_count FROM workspaces WHERE owner_id = owner AND id <> NEW.id;
   IF workspace_cap IS NOT NULL AND workspace_count + 1 > workspace_cap THEN
     RAISE EXCEPTION 'Your plan workspace limit is reached' USING ERRCODE = '23514';
   END IF;
   RETURN NEW;
 END IF;
 IF account_cap IS NULL OR NOT NEW.is_active THEN RETURN NEW; END IF;
 SELECT COALESCE(sum(1 + CASE WHEN page->'instagram_business_account' IS NOT NULL AND page->'instagram_business_account' <> 'null'::jsonb THEN 1 ELSE 0 END), 0)
 INTO account_count FROM meta_connections c JOIN workspaces w ON w.id = c.workspace_id
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.pages, '[]'::jsonb)) page
 WHERE w.owner_id = owner AND c.is_active
 AND (TG_TABLE_NAME <> 'meta_connections' OR (c.id <> NEW.id AND c.workspace_id <> NEW.workspace_id))
 AND (c.selected_page_ids IS NULL OR c.selected_page_ids @> jsonb_build_array(page->>'id'));
 SELECT account_count + count(*) INTO account_count FROM linkedin_connections c
 JOIN workspaces w ON w.id = c.workspace_id WHERE w.owner_id = owner AND c.is_active
 AND (TG_TABLE_NAME <> 'linkedin_connections' OR (c.id <> NEW.id AND c.workspace_id <> NEW.workspace_id));
 SELECT account_count + count(*) INTO account_count FROM instagram_connections c
 JOIN workspaces w ON w.id = c.workspace_id WHERE w.owner_id = owner AND c.is_active
 AND (TG_TABLE_NAME <> 'instagram_connections' OR (c.id <> NEW.id AND c.workspace_id <> NEW.workspace_id));
 IF TG_TABLE_NAME IN ('linkedin_connections', 'instagram_connections') THEN account_count := account_count + 1;
 ELSE
   SELECT account_count + COALESCE(sum(1 + CASE WHEN page->'instagram_business_account' IS NOT NULL AND page->'instagram_business_account' <> 'null'::jsonb THEN 1 ELSE 0 END), 0)
   INTO account_count FROM jsonb_array_elements(COALESCE(NEW.pages, '[]'::jsonb)) page
   WHERE NEW.selected_page_ids IS NULL OR NEW.selected_page_ids @> jsonb_build_array(page->>'id');
 END IF;
 IF account_count > account_cap THEN RAISE EXCEPTION 'Your plan social account limit is reached' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_instagram_capacity BEFORE INSERT OR UPDATE OF workspace_id, is_active
 ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();
COMMIT;
