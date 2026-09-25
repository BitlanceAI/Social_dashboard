-- Private service-backed inbox. Browser clients cannot access these tables/RPCs.
CREATE TABLE public.social_message_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('facebook','instagram')),
    account_id text NOT NULL,
    page_id text NOT NULL,
    name text NOT NULL,
    UNIQUE (workspace_id, provider, account_id)
);
CREATE INDEX social_message_accounts_lookup ON public.social_message_accounts(provider, account_id);
CREATE INDEX social_message_accounts_connection ON public.social_message_accounts(connection_id);

CREATE TABLE public.social_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.social_message_accounts(id) ON DELETE CASCADE,
    participant_id text NOT NULL,
    last_message_at timestamptz,
    last_inbound_at timestamptz,
    read_at timestamptz,
    delivered_at timestamptz,
    seen_at timestamptz,
    preview text NOT NULL DEFAULT '',
    UNIQUE(account_id, participant_id)
);
CREATE INDEX social_conversations_recent ON public.social_conversations(account_id, last_message_at DESC);

CREATE TABLE public.social_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.social_conversations(id) ON DELETE CASCADE,
    provider_message_id text,
    request_id uuid,
    direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
    text text NOT NULL DEFAULT '',
    attachments jsonb NOT NULL DEFAULT '[]',
    sent_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'received',
    UNIQUE(conversation_id, provider_message_id),
    UNIQUE(conversation_id, request_id)
);
CREATE INDEX social_messages_thread ON public.social_messages(conversation_id, sent_at DESC, id DESC);

ALTER TABLE public.social_message_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_message_accounts, public.social_conversations, public.social_messages FROM anon, authenticated;
GRANT ALL ON public.social_message_accounts, public.social_conversations, public.social_messages TO service_role;

-- Atomic insert + summary update: replayed messages cannot reopen the reply window.
CREATE FUNCTION public.ingest_social_message(p_account uuid, p_participant text, p_mid text,
    p_direction text, p_text text, p_attachments jsonb, p_time timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread uuid; v_count integer;
BEGIN
    INSERT INTO social_conversations(account_id,participant_id) VALUES(p_account,p_participant)
    ON CONFLICT(account_id,participant_id) DO NOTHING;
    SELECT id INTO v_thread FROM social_conversations
      WHERE account_id=p_account AND participant_id=p_participant FOR UPDATE;
    INSERT INTO social_messages(conversation_id,provider_message_id,direction,text,attachments,sent_at,status)
      VALUES(v_thread,p_mid,p_direction,p_text,p_attachments,p_time,
        CASE WHEN p_direction='inbound' THEN 'received' ELSE 'sent' END)
      ON CONFLICT(conversation_id,provider_message_id) DO NOTHING;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count > 0 THEN
      UPDATE social_conversations SET
        preview=CASE WHEN last_message_at IS NULL OR p_time>=last_message_at THEN left(p_text,180) ELSE preview END,
        last_message_at=greatest(last_message_at,p_time),
        last_inbound_at=CASE WHEN p_direction='inbound' THEN greatest(last_inbound_at,p_time) ELSE last_inbound_at END
      WHERE id=v_thread;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_social_message(uuid,text,text,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_social_message(uuid,text,text,text,text,jsonb,timestamptz) TO service_role;

-- Receipt watermarks must only move forward when deliveries arrive out of order.
CREATE FUNCTION public.social_message_receipt(p_account uuid,p_participant text,p_time timestamptz,p_seen boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE social_conversations SET
    delivered_at=greatest(delivered_at,p_time),
    seen_at=CASE WHEN p_seen THEN greatest(seen_at,p_time) ELSE seen_at END
  WHERE account_id=p_account AND participant_id=p_participant;
$$;
REVOKE ALL ON FUNCTION public.social_message_receipt(uuid,text,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_message_receipt(uuid,text,timestamptz,boolean) TO service_role;

-- Deselecting/replacing an account removes its conversations; disconnect cascades.
CREATE FUNCTION public.prune_social_message_accounts() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM social_message_accounts WHERE connection_id=NEW.id AND (
    NEW.meta_user_id IS DISTINCT FROM OLD.meta_user_id OR NOT NEW.is_active OR
    NOT coalesce(to_jsonb(NEW.selected_page_ids) ? page_id,false));
  RETURN NEW;
END; $$;
CREATE TRIGGER prune_social_message_accounts AFTER UPDATE OF selected_page_ids, meta_user_id, is_active
ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION public.prune_social_message_accounts();
