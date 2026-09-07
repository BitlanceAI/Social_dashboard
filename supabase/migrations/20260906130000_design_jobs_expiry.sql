-- ============================================================
-- Design-image retention: generated flyer images are deleted from storage
-- (Bunny / Supabase) ~30 days after creation by the scheduler's daily sweep.
-- The job row is KEPT for history but marked 'expired' with its flyer_url
-- cleared, so the record survives while the paid storage is freed.
-- ============================================================

ALTER TABLE public.design_jobs
    DROP CONSTRAINT IF EXISTS design_jobs_status_check;

ALTER TABLE public.design_jobs
    ADD CONSTRAINT design_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired'));

-- The sweep scans completed jobs by age; support that lookup directly.
CREATE INDEX IF NOT EXISTS idx_design_jobs_status_created
    ON public.design_jobs (status, created_at);
