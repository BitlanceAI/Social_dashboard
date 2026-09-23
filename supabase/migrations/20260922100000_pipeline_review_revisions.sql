-- Keep rejected originals for audit and make resubmission atomic.
ALTER TABLE public.scheduled_posts
    ADD COLUMN IF NOT EXISTS resubmitted_post_id UUID REFERENCES public.scheduled_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_queue_scheduled_post ON public.content_queue(scheduled_post_id);

CREATE OR REPLACE FUNCTION public.pipeline_post_status(p_status TEXT, p_rejected_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE WHEN p_status = 'pending' THEN 'scheduled'
                WHEN p_status = 'cancelled' AND p_rejected_at IS NOT NULL THEN 'rejected'
                ELSE p_status END;
$$;

CREATE OR REPLACE FUNCTION public.sync_pipeline_post_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    UPDATE public.content_queue
       SET status = public.pipeline_post_status(NEW.status, NEW.rejected_at),
           generated_caption = NEW.content, generated_hashtags = '',
           updated_at = now()
     WHERE scheduled_post_id = NEW.id AND workspace_id = NEW.workspace_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pipeline_post_status ON public.scheduled_posts;
CREATE TRIGGER sync_pipeline_post_status AFTER UPDATE OF status, content, rejected_at ON public.scheduled_posts
    FOR EACH ROW EXECUTE FUNCTION public.sync_pipeline_post_status();

-- Linking after generation must also pick up an approval that already arrived.
CREATE OR REPLACE FUNCTION public.sync_pipeline_link_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p public.scheduled_posts;
BEGIN
    IF NEW.scheduled_post_id IS NOT NULL THEN
        SELECT * INTO p FROM public.scheduled_posts
         WHERE id = NEW.scheduled_post_id AND workspace_id = NEW.workspace_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Linked post must belong to the same workspace'; END IF;
        NEW.status := public.pipeline_post_status(p.status, p.rejected_at);
        NEW.generated_caption := p.content;
        NEW.generated_hashtags := '';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_pipeline_link_status ON public.content_queue;
CREATE TRIGGER sync_pipeline_link_status BEFORE INSERT OR UPDATE OF scheduled_post_id ON public.content_queue
    FOR EACH ROW EXECUTE FUNCTION public.sync_pipeline_link_status();

UPDATE public.content_queue q
   SET status = public.pipeline_post_status(p.status, p.rejected_at),
       generated_caption = p.content, generated_hashtags = '', updated_at = now()
  FROM public.scheduled_posts p
 WHERE q.scheduled_post_id = p.id AND q.workspace_id = p.workspace_id;

CREATE OR REPLACE FUNCTION public.resubmit_rejected_post(
    p_post_id UUID, p_workspace_id UUID, p_content TEXT,
    p_expected_content TEXT, p_expected_feedback TEXT, p_approvers JSONB
) RETURNS public.scheduled_posts
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE original public.scheduled_posts;
DECLARE revised public.scheduled_posts;
BEGIN
    SELECT * INTO original FROM public.scheduled_posts
     WHERE id = p_post_id AND workspace_id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002'; END IF;
    IF original.status <> 'cancelled' OR original.rejected_at IS NULL
       OR original.resubmitted_post_id IS NOT NULL
       OR original.content IS DISTINCT FROM p_expected_content
       OR original.rejection_comment IS DISTINCT FROM p_expected_feedback THEN
        RAISE EXCEPTION 'Post or feedback changed. Refresh and review again.' USING ERRCODE = '40001';
    END IF;
    IF p_content IS NULL OR length(btrim(p_content)) = 0 OR length(p_content) > 20000 THEN
        RAISE EXCEPTION 'Caption must contain between 1 and 20000 characters' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.scheduled_posts (
        workspace_id, user_id, provider, meta_connection_id, linkedin_connection_id,
        page_id, page_name, platforms, content, media_urls, link_url, timezone,
        scheduled_time, status, approver_phones
    ) VALUES (
        original.workspace_id, original.user_id, original.provider, original.meta_connection_id, original.linkedin_connection_id,
        original.page_id, original.page_name, original.platforms, btrim(p_content), original.media_urls, original.link_url, original.timezone,
        greatest(original.scheduled_time, now()), 'pending_approval', p_approvers
    ) RETURNING * INTO revised;
    UPDATE public.scheduled_posts SET resubmitted_post_id = revised.id,
        awaiting_rejection_feedback = false, updated_at = now() WHERE id = original.id;
    UPDATE public.content_queue SET scheduled_post_id = revised.id, error_message = NULL, updated_at = now()
     WHERE scheduled_post_id = original.id AND workspace_id = p_workspace_id;
    RETURN revised;
END;
$$;

-- Only the authenticated server may call the resubmission operation.
REVOKE ALL ON FUNCTION public.resubmit_rejected_post(UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_rejected_post(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;
