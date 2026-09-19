-- Only the confirmed Bitlance admin identity is exempt. No request-supplied email is trusted.
CREATE FUNCTION public.is_billing_exempt(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (
   SELECT 1 FROM auth.users a JOIN public.users p ON p.id=a.id
   WHERE a.id=p_user AND lower(trim(a.email))='bitlanceai@gmail.com'
   AND a.email_confirmed_at IS NOT NULL AND p.role='admin'
 );
$$;
REVOKE ALL ON FUNCTION public.is_billing_exempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_billing_exempt(uuid) TO service_role;

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
 IF TG_TABLE_NAME = 'linkedin_connections' THEN account_count := account_count + 1;
 ELSE
   SELECT account_count + COALESCE(sum(1 + CASE WHEN page->'instagram_business_account' IS NOT NULL AND page->'instagram_business_account' <> 'null'::jsonb THEN 1 ELSE 0 END), 0)
   INTO account_count FROM jsonb_array_elements(COALESCE(NEW.pages, '[]'::jsonb)) page
   WHERE NEW.selected_page_ids IS NULL OR NEW.selected_page_ids @> jsonb_build_array(page->>'id');
 END IF;
 IF account_count > account_cap THEN RAISE EXCEPTION 'Your plan social account limit is reached' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
