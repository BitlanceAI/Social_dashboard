-- Web push (Firebase Cloud Messaging) registration tokens.
--
-- One row per browser/device a user has opted in from, so a person who uses
-- the dashboard on a laptop and a phone gets notified on both.
--
-- FCM tokens rotate and can go stale; the sender prunes anything FCM reports
-- as UNREGISTERED, so this table stays self-cleaning.

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    -- The same browser re-registering must update, not duplicate
    UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
    ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- The server writes with the service_role key and bypasses RLS; this only
-- governs what the browser can see.
DROP POLICY IF EXISTS "Users view own push tokens" ON public.push_tokens;
CREATE POLICY "Users view own push tokens" ON public.push_tokens
    FOR SELECT USING (auth.uid() = user_id);
