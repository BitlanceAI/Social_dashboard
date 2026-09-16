-- ============================================================
-- WhatsApp approval for scheduled posts.
--
-- A post scheduled with one or more approver numbers is stored as
-- 'pending_approval' and an interactive WhatsApp template (Approve / Reject
-- buttons) goes to every approver. The first decision wins: Approve moves the
-- row to 'pending' (or hands it to Meta natively when still eligible) and
-- Reject cancels it. Approvers can also reply to the caption message to edit
-- the caption before deciding, and a rejected post asks for a reason that is
-- stored in rejection_comment.
--
-- The scheduler only ever publishes 'pending', so a 'pending_approval' row can
-- never go out before someone taps Approve.
-- ============================================================

ALTER TABLE public.scheduled_posts
    DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;

ALTER TABLE public.scheduled_posts
    ADD CONSTRAINT scheduled_posts_status_check
    CHECK (status IN ('pending_approval', 'pending', 'processing', 'scheduled', 'published', 'failed', 'cancelled'));

ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS approver_phones             JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS whatsapp_message_id         TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_caption_message_id TEXT,
    ADD COLUMN IF NOT EXISTS approval_sent_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_reminders_sent     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_approval_reminder_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by                 TEXT,
    ADD COLUMN IF NOT EXISTS approved_at                 TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_by                 TEXT,
    ADD COLUMN IF NOT EXISTS rejected_at                 TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS awaiting_rejection_feedback BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rejection_comment           TEXT;

-- The reminder sweep and the webhook look rows up by status + message id.
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_pending_approval
    ON public.scheduled_posts (approval_sent_at)
    WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_wa_message
    ON public.scheduled_posts (whatsapp_message_id)
    WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_wa_caption_message
    ON public.scheduled_posts (whatsapp_caption_message_id)
    WHERE whatsapp_caption_message_id IS NOT NULL;

-- ============================================================
-- approval_settings — approver numbers remembered per workspace so the
-- scheduling UI can offer them again. Written only by the server.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approval_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    phones       JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.approval_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read approval settings" ON public.approval_settings;
CREATE POLICY "Members read approval settings" ON public.approval_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members m
            WHERE m.workspace_id = approval_settings.workspace_id
              AND m.user_id = auth.uid()
        )
    );
