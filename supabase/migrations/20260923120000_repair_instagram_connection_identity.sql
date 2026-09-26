-- An earlier manual rollout created the Instagram tables without this trigger.
-- Safe after the original migration too: keep the account identity stable on reconnect.
CREATE OR REPLACE FUNCTION public.preserve_instagram_connection_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.instagram_user_id IS DISTINCT FROM OLD.instagram_user_id THEN
        RAISE EXCEPTION 'Disconnect the existing Instagram account before connecting another one';
    END IF;
    RETURN NEW;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.instagram_connections'::regclass
          AND tgname = 'instagram_connection_identity'
    ) THEN
        CREATE TRIGGER instagram_connection_identity
        BEFORE UPDATE OF instagram_user_id ON public.instagram_connections
        FOR EACH ROW EXECUTE FUNCTION public.preserve_instagram_connection_identity();
    END IF;
END $$;
