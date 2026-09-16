-- Reusable template inputs, shared only within the active workspace.
CREATE TABLE IF NOT EXISTS public.template_saved_details (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    language TEXT NOT NULL DEFAULT 'en',
    include_contact BOOLEAN NOT NULL DEFAULT true,
    auto_reuse BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_saved_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read saved template details" ON public.template_saved_details
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = template_saved_details.workspace_id AND m.user_id = auth.uid()
    ));

-- Previously used numbers remain suggestions. Only explicitly saved defaults
-- are automatically selected, so old approvers are never silently added.
ALTER TABLE public.approval_settings
    ADD COLUMN IF NOT EXISTS default_phones JSONB NOT NULL DEFAULT '[]'::jsonb;
