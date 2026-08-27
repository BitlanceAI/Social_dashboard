-- Migration: create google_oauth_tokens table
-- Run this once in your Supabase SQL editor (or via Supabase CLI migrations)

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date  BIGINT,                          -- Unix epoch ms from googleapis
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Row-Level Security: users can only read/update their own tokens
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tokens"
    ON public.google_oauth_tokens
    FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service-role (server) bypasses RLS automatically, so no extra policy needed
-- for server-side upserts.
