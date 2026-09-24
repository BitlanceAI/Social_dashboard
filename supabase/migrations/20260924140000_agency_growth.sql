-- Additive agency workflows. Apply after the client portal migration.
BEGIN;
CREATE TABLE public.campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160), objective text NOT NULL DEFAULT '',
 starts_at timestamptz, ends_at timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE UNIQUE INDEX campaigns_workspace_name ON public.campaigns(workspace_id,lower(name));
CREATE TABLE public.content_pillars (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160), description text NOT NULL DEFAULT '',
 color text NOT NULL DEFAULT '#1AA8A8' CHECK (color ~ '^#[0-9a-fA-F]{6}$'), is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id)
);
CREATE UNIQUE INDEX pillars_workspace_name ON public.content_pillars(workspace_id,lower(name));
CREATE TABLE public.content_briefs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users, updated_by uuid REFERENCES auth.users, assigned_to uuid,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160), objective text NOT NULL DEFAULT '',
 instructions text NOT NULL DEFAULT '', reference_urls jsonb NOT NULL DEFAULT '[]',
 requested_channels jsonb NOT NULL DEFAULT '[]', due_at timestamptz, desired_publish_at timestamptz,
 campaign_id uuid, status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','needs_info','in_progress','completed','cancelled')),
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,campaign_id) REFERENCES public.campaigns(workspace_id,id)
);
CREATE INDEX briefs_inbox ON public.content_briefs(workspace_id,status,created_at DESC,id);
CREATE INDEX briefs_campaign ON public.content_briefs(workspace_id,campaign_id);
CREATE TABLE public.brief_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brief_id uuid NOT NULL,
 author_id uuid NOT NULL REFERENCES auth.users, body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
 visibility text NOT NULL DEFAULT 'shared' CHECK(visibility IN ('shared','internal')), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,brief_id) REFERENCES public.content_briefs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX brief_comments_thread ON public.brief_comments(workspace_id,brief_id,created_at,id);
CREATE TABLE public.brief_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brief_id uuid NOT NULL,
 actor_id uuid REFERENCES auth.users, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,brief_id) REFERENCES public.content_briefs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX brief_events_thread ON public.brief_events(workspace_id,brief_id,created_at);
CREATE TABLE public.brief_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brief_id uuid NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES auth.users, object_key text NOT NULL UNIQUE, filename text NOT NULL,
 mime_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,brief_id) REFERENCES public.content_briefs(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX brief_attachments_parent ON public.brief_attachments(workspace_id,brief_id);
CREATE FUNCTION public.limit_brief_attachments() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM content_briefs WHERE id=NEW.brief_id AND workspace_id=NEW.workspace_id FOR UPDATE;
 IF (SELECT count(*) FROM brief_attachments WHERE brief_id=NEW.brief_id) >= 10 THEN
   RAISE EXCEPTION 'A brief supports at most 10 files' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limit_brief_attachments BEFORE INSERT ON public.brief_attachments FOR EACH ROW EXECUTE FUNCTION public.limit_brief_attachments();

ALTER TABLE public.content_items ADD COLUMN campaign_id uuid, ADD COLUMN pillar_id uuid, ADD COLUMN brief_id uuid,
 ADD CONSTRAINT content_campaign_workspace_fk FOREIGN KEY(workspace_id,campaign_id) REFERENCES public.campaigns(workspace_id,id),
 ADD CONSTRAINT content_pillar_workspace_fk FOREIGN KEY(workspace_id,pillar_id) REFERENCES public.content_pillars(workspace_id,id),
 ADD CONSTRAINT content_brief_workspace_fk FOREIGN KEY(workspace_id,brief_id) REFERENCES public.content_briefs(workspace_id,id);
CREATE INDEX content_campaign_calendar ON public.content_items(workspace_id,campaign_id,planned_for);
CREATE INDEX content_pillar_calendar ON public.content_items(workspace_id,pillar_id,planned_for);
CREATE INDEX content_brief ON public.content_items(workspace_id,brief_id);
INSERT INTO public.campaigns(workspace_id,name)
 SELECT workspace_id,min(btrim(campaign_name)) FROM public.content_items
 WHERE nullif(btrim(campaign_name),'') IS NOT NULL GROUP BY workspace_id,lower(btrim(campaign_name));
UPDATE public.content_items i SET campaign_id=c.id FROM public.campaigns c
 WHERE i.workspace_id=c.workspace_id AND lower(btrim(i.campaign_name))=lower(c.name);

CREATE TABLE public.report_schedules (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, day_of_month integer NOT NULL DEFAULT 1 CHECK(day_of_month BETWEEN 1 AND 28),
 timezone text NOT NULL DEFAULT 'Asia/Kolkata', narrative text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces ON DELETE CASCADE,
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), timezone text NOT NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL CHECK(period_end>period_start),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed')),
 schema_version integer NOT NULL DEFAULT 1, metrics jsonb, brand_snapshot jsonb, narrative text NOT NULL DEFAULT '',
 pdf_object_key text, error_message text, attempts integer NOT NULL DEFAULT 0,
 claim_token uuid, leased_until timestamptz, generated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,month)
);
CREATE INDEX reports_history ON public.report_snapshots(workspace_id,month DESC);
CREATE INDEX reports_worker ON public.report_snapshots(status,leased_until,created_at);

-- Postgres claims fence overlapping workers; stale workers cannot finalize.
CREATE FUNCTION public.claim_report_job() RETURNS SETOF public.report_snapshots
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target uuid;
BEGIN
 SELECT id INTO target FROM report_snapshots
 WHERE (status='queued' OR (status='processing' AND leased_until<now())) AND attempts<3
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF target IS NOT NULL THEN
 RETURN QUERY UPDATE report_snapshots SET status='processing',attempts=attempts+1,
   claim_token=gen_random_uuid(),leased_until=now()+interval '30 minutes' WHERE id=target RETURNING *;
 END IF;
 UPDATE report_snapshots SET status='failed', error_message='Report worker stopped. Retry generation.'
 WHERE status='processing' AND leased_until<now() AND attempts>=3;
END $$;
REVOKE ALL ON FUNCTION public.claim_report_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_job() TO service_role;

CREATE FUNCTION public.audit_brief_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO brief_events(workspace_id,brief_id,actor_id,action)
 VALUES(NEW.workspace_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN NEW.created_by ELSE NEW.updated_by END,
 CASE WHEN TG_OP='INSERT' THEN 'submitted' WHEN OLD.status IS DISTINCT FROM NEW.status THEN NEW.status WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'assignment_changed' ELSE 'updated' END);
 RETURN NEW;
END $$;
CREATE TRIGGER audit_brief_change AFTER INSERT OR UPDATE ON public.content_briefs FOR EACH ROW EXECUTE FUNCTION public.audit_brief_change();

-- All mutations use the authorized server. Direct browser reads remain scoped.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['campaigns','content_pillars','content_briefs','brief_attachments','brief_events','report_snapshots'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY workspace_read ON public.%I FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id))',t);
 EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
ALTER TABLE public.brief_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.brief_comments FOR SELECT TO authenticated USING (
 public.is_workspace_member(workspace_id) AND (visibility='shared' OR public.workspace_role(workspace_id) IN ('owner','admin','member'))
);
REVOKE INSERT,UPDATE,DELETE ON public.brief_comments FROM anon,authenticated;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.report_schedules FOR SELECT TO authenticated USING(public.workspace_role(workspace_id) IN ('owner','admin'));
REVOKE INSERT,UPDATE,DELETE ON public.report_schedules FROM anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('agency-private','agency-private',false,10485760)
 ON CONFLICT(id) DO NOTHING;
COMMIT;
