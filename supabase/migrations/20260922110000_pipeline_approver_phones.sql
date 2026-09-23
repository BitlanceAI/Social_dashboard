-- Empty lists preserve the existing workspace-default approval behavior.
ALTER TABLE public.content_pipelines
    ADD COLUMN IF NOT EXISTS approver_phones JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(approver_phones) = 'array');
