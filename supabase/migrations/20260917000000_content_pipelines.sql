-- Migration: AI Content Automation Pipelines & Content Queue
-- Supports automated content generation (captions + images) and multi-platform publishing (LinkedIn, Meta, Instagram)

CREATE TABLE IF NOT EXISTS public.content_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'paused'
    trigger_time TIME NOT NULL DEFAULT '09:30:00', -- Daily execution time (UTC or local)
    target_platforms TEXT[] NOT NULL DEFAULT ARRAY['linkedin'], -- 'linkedin', 'facebook', 'instagram'
    page_id VARCHAR(255), -- Selected Facebook Page ID or LinkedIn Author URN
    provider VARCHAR(50) NOT NULL DEFAULT 'linkedin', -- 'linkedin', 'meta'
    
    -- Content Source
    sheet_url TEXT,
    sheet_id VARCHAR(255),
    
    -- AI Prompt Templates
    brand_logo_text VARCHAR(255) DEFAULT 'Rahul Saini',
    caption_prompt_template TEXT,
    image_prompt_template TEXT,
    image_generation_mode VARCHAR(50) DEFAULT 'dalle', -- 'dalle', 'template'
    
    -- Automation Controls
    auto_publish BOOLEAN NOT NULL DEFAULT true, -- true = publish immediately, false = push to approval queue
    
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES public.content_pipelines(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    
    -- Queue Data (From Google Sheet or Manual Entry)
    day VARCHAR(50),
    date_str VARCHAR(50),
    title_hook TEXT NOT NULL,
    content_pillar VARCHAR(255),
    caption_outline TEXT,
    format VARCHAR(100),
    cta TEXT,
    
    -- Status & AI Output
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'generating', 'scheduled', 'posted', 'failed'
    generated_caption TEXT,
    generated_hashtags TEXT,
    generated_image_url TEXT,
    error_message TEXT,
    
    scheduled_post_id UUID REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast querying during scheduler tick
CREATE INDEX IF NOT EXISTS idx_pipelines_workspace ON public.content_pipelines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_status ON public.content_pipelines(status);
CREATE INDEX IF NOT EXISTS idx_queue_pipeline_status ON public.content_queue(pipeline_id, status);
