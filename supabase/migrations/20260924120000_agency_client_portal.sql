-- Agency client portal: editorial planning, versioned review, comments and brand data.

ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'client'));

ALTER TABLE public.workspace_invites DROP CONSTRAINT IF EXISTS workspace_invites_role_check;
ALTER TABLE public.workspace_invites ADD CONSTRAINT workspace_invites_role_check
    CHECK (role IN ('admin', 'member', 'client'));

CREATE TABLE public.content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    campaign_name TEXT,
    title TEXT NOT NULL DEFAULT 'Untitled post',
    provider TEXT NOT NULL CHECK (provider IN ('meta', 'linkedin')),
    destination JSONB NOT NULL DEFAULT '{}'::jsonb,
    planned_for TIMESTAMPTZ,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN (
        'draft', 'internal_review', 'client_review', 'changes_requested',
        'approved', 'scheduled', 'published', 'failed', 'cancelled'
    )),
    current_version_id UUID,
    approved_version_id UUID,
    scheduled_post_id UUID REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_items_workspace_calendar
    ON public.content_items (workspace_id, planned_for, id);
CREATE INDEX idx_content_items_workspace_status
    ON public.content_items (workspace_id, review_status, updated_at DESC);

CREATE TABLE public.content_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    caption TEXT NOT NULL CHECK (char_length(caption) BETWEEN 1 AND 20000),
    media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    link_url TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (content_item_id, version_number),
    UNIQUE (content_item_id, id)
);

ALTER TABLE public.content_items
    ADD CONSTRAINT content_items_current_version_fk
    FOREIGN KEY (id, current_version_id) REFERENCES public.content_versions(content_item_id, id),
    ADD CONSTRAINT content_items_approved_version_fk
    FOREIGN KEY (id, approved_version_id) REFERENCES public.content_versions(content_item_id, id);

CREATE INDEX idx_content_versions_item
    ON public.content_versions (content_item_id, version_number DESC);

CREATE TABLE public.content_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
    content_version_id UUID REFERENCES public.content_versions(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    parent_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
    visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'internal')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_content_comments_item
    ON public.content_comments (content_item_id, created_at, id) WHERE deleted_at IS NULL;

CREATE TABLE public.content_approval_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
    content_version_id UUID REFERENCES public.content_versions(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_approval_events_item
    ON public.content_approval_events (content_item_id, created_at, id);

CREATE TABLE public.workspace_brand_profiles (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    client_name TEXT,
    logo_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#1AA8A8',
    secondary_color TEXT NOT NULL DEFAULT '#0A0A0A',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    tone_of_voice TEXT,
    content_pillars JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    prohibited_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
    competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
    report_footer TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS content_version_id UUID REFERENCES public.content_versions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uniq_scheduled_post_content_version
    ON public.scheduled_posts (content_item_id, content_version_id)
    WHERE content_item_id IS NOT NULL AND content_version_id IS NOT NULL;

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read content items" ON public.content_items
    FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members read content versions" ON public.content_versions
    FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members read shared comments" ON public.content_comments
    FOR SELECT USING (
        public.is_workspace_member(workspace_id)
        AND (visibility = 'shared' OR public.workspace_role(workspace_id) <> 'client')
    );
CREATE POLICY "Members read approval events" ON public.content_approval_events
    FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members read brand profiles" ON public.workspace_brand_profiles
    FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Mirror delivery state for calendar display without making content_items a
-- second publishing queue.
CREATE OR REPLACE FUNCTION public.sync_content_item_delivery_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.content_item_id IS NOT NULL AND NEW.status IN ('published', 'failed', 'cancelled') THEN
        UPDATE public.content_items
           SET review_status = NEW.status, updated_at = now()
         WHERE id = NEW.content_item_id AND workspace_id = NEW.workspace_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_content_item_delivery_status ON public.scheduled_posts;
CREATE TRIGGER sync_content_item_delivery_status
    AFTER UPDATE OF status ON public.scheduled_posts
    FOR EACH ROW EXECUTE FUNCTION public.sync_content_item_delivery_status();

