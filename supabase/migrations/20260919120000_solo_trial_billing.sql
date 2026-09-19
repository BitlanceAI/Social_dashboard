-- New signup defaults; existing subscriptions retain their current access.
ALTER TABLE public.subscription_plans
 ADD COLUMN generation_limit integer CHECK (generation_limit >= 0),
 ADD COLUMN trial_auto_post_limit integer CHECK (trial_auto_post_limit >= 0),
 ADD COLUMN trial_days integer NOT NULL DEFAULT 15 CHECK (trial_days BETWEEN 1 AND 90),
 ADD COLUMN mandate_required boolean NOT NULL DEFAULT true;

INSERT INTO public.subscription_plans
 (plan_key, name, tagline, monthly_price, yearly_price, included_accounts,
 included_users, included_workspaces, generation_limit, trial_auto_post_limit, features, sort_order)
SELECT 'solo', 'Solo', 'One account. One workspace. Your AI publishing assistant.',
 30000, 300000, 1, 1, 1, 20, 2,
 '["AI caption and image generation", "Automatic pipeline publishing"]'::jsonb, 0
FROM public.subscription_plans WHERE plan_key = 'starter'
ON CONFLICT (plan_key) DO NOTHING;

ALTER TABLE public.subscriptions
 ADD COLUMN mandate_required boolean NOT NULL DEFAULT false,
 ADD COLUMN mandate_authorized_at timestamptz,
 ADD COLUMN current_period_start timestamptz,
 ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
 ADD COLUMN checkout_started_at timestamptz,
 ADD COLUMN recurring_consent_at timestamptz;

CREATE TABLE public.subscription_usage (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('generations', 'trial_auto_posts')),
 period_key text NOT NULL,
 used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
 PRIMARY KEY (user_id, kind, period_key)
);
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

-- Serialize quota reservations per owner. Only the service role may invoke this.
CREATE FUNCTION public.reserve_subscription_usage(p_user uuid, p_kind text, p_period text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
 IF p_limit IS NULL THEN RETURN true; END IF;
 IF p_limit < 1 THEN RETURN false; END IF;
 INSERT INTO subscription_usage(user_id, kind, period_key, used)
 VALUES(p_user, p_kind, p_period, 1)
 ON CONFLICT(user_id, kind, period_key) DO UPDATE
 SET used = subscription_usage.used + 1 WHERE subscription_usage.used < p_limit
 RETURNING used INTO n;
 RETURN n IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.reserve_subscription_usage(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_subscription_usage(uuid,text,text,integer) TO service_role;

-- Enforce capacity at the database boundary, including OAuth callbacks and RPCs.
CREATE FUNCTION public.enforce_subscription_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid; account_cap integer; workspace_cap integer; account_count integer; workspace_count integer;
BEGIN
 IF TG_TABLE_NAME = 'workspaces' THEN owner := NEW.owner_id;
 ELSE SELECT owner_id INTO owner FROM workspaces WHERE id = NEW.workspace_id;
 END IF;
 IF owner IS NULL THEN RAISE EXCEPTION 'Workspace owner is required'; END IF;
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
 IF TG_TABLE_NAME = 'linkedin_connections' THEN account_count := account_count + 1;
 ELSE
   SELECT account_count + COALESCE(sum(1 + CASE WHEN page->'instagram_business_account' IS NOT NULL AND page->'instagram_business_account' <> 'null'::jsonb THEN 1 ELSE 0 END), 0)
   INTO account_count FROM jsonb_array_elements(COALESCE(NEW.pages, '[]'::jsonb)) page
   WHERE NEW.selected_page_ids IS NULL OR NEW.selected_page_ids @> jsonb_build_array(page->>'id');
 END IF;
 IF account_count > account_cap THEN RAISE EXCEPTION 'Your plan social account limit is reached' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_workspace_capacity BEFORE INSERT OR UPDATE OF owner_id ON public.workspaces
 FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();
CREATE TRIGGER subscription_meta_capacity BEFORE INSERT OR UPDATE OF workspace_id, pages, selected_page_ids, is_active ON public.meta_connections
 FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();
CREATE TRIGGER subscription_linkedin_capacity BEFORE INSERT OR UPDATE OF workspace_id, is_active ON public.linkedin_connections
 FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();

CREATE FUNCTION public.release_subscription_usage(p_user uuid, p_kind text, p_period text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE subscription_usage SET used = greatest(used - 1, 0)
 WHERE user_id=p_user AND kind=p_kind AND period_key=p_period;
$$;
REVOKE ALL ON FUNCTION public.release_subscription_usage(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_subscription_usage(uuid,text,text) TO service_role;
