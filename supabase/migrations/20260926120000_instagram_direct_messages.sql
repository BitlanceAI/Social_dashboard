-- Let the shared inbox distinguish Page-linked and direct Instagram Login accounts.
ALTER TABLE public.social_message_accounts
    ALTER COLUMN connection_id DROP NOT NULL,
    ADD COLUMN instagram_connection_id uuid,
    ADD COLUMN connection_type text NOT NULL DEFAULT 'meta'
        CHECK (connection_type IN ('meta', 'instagram_login'));

ALTER TABLE public.social_message_accounts
    ADD CONSTRAINT social_message_accounts_instagram_workspace_fk
        FOREIGN KEY (instagram_connection_id, workspace_id)
        REFERENCES public.instagram_connections(id, workspace_id) ON DELETE CASCADE,
    DROP CONSTRAINT social_message_accounts_workspace_id_provider_account_id_key,
    ADD CONSTRAINT social_message_accounts_workspace_provider_account_source_key
        UNIQUE (workspace_id, provider, account_id, connection_type),
    ADD CONSTRAINT social_message_accounts_source_check CHECK (
        (connection_type = 'meta' AND connection_id IS NOT NULL AND instagram_connection_id IS NULL)
        OR (connection_type = 'instagram_login' AND provider = 'instagram'
            AND connection_id IS NULL AND instagram_connection_id IS NOT NULL)
    );

CREATE INDEX social_message_accounts_instagram_connection
    ON public.social_message_accounts(instagram_connection_id);

CREATE FUNCTION public.prune_direct_instagram_message_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT NEW.is_active OR NEW.instagram_user_id IS DISTINCT FROM OLD.instagram_user_id THEN
        DELETE FROM social_message_accounts WHERE instagram_connection_id = NEW.id;
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER prune_direct_instagram_message_accounts
AFTER UPDATE OF instagram_user_id, is_active ON public.instagram_connections
FOR EACH ROW EXECUTE FUNCTION public.prune_direct_instagram_message_accounts();
