import { normalizeContentItem } from '../../shared/utils/pipeline-content.mjs';
/**
 * Pipeline Management Service
 */

import { supabaseAdmin, supabase } from '../../config/supabase.js';

const getClient = () => supabaseAdmin || supabase;

export const normalizePipelineApprovers = (input) => {
    if (input == null || input === '') return [];
    if (!Array.isArray(input) && typeof input !== 'string') {
        throw new Error('Enter WhatsApp approval numbers with country codes, separated by commas.');
    }
    const parts = Array.isArray(input) ? input : input.split(/[,;\n]+/);
    const phones = parts.map(value => {
        if (typeof value !== 'string') throw new Error('WhatsApp approval numbers must be text.');
        const valueTrimmed = value.trim();
        if (!valueTrimmed) return null;
        const phone = valueTrimmed.replace(/[\s()-]/g, '').replace(/^\+/, '');
        if (!/^[1-9]\d{6,14}$/.test(phone)) {
            throw new Error('Enter a valid WhatsApp approval number with country code (7–15 digits).');
        }
        return phone;
    }).filter(Boolean);
    return [...new Set(phones)];
};

export const getPipelines = async (workspaceId) => {
    if (!workspaceId) return [];
    const { data, error } = await getClient()
        .from('content_pipelines')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

export const getPipelineById = async (pipelineId, workspaceId) => {
    const { data, error } = await getClient()
        .from('content_pipelines')
        .select('*')
        .eq('id', pipelineId)
        .eq('workspace_id', workspaceId)
        .single();

    if (error) throw error;
    return data;
};

export const createPipeline = async (workspaceId, userId, payload) => {
    if (!workspaceId) throw new Error('Active workspace is required to create a pipeline');
    const {
        name,
        triggerTime = '09:30:00',
        targetPlatforms = ['linkedin'],
        pageId = null,
        provider = 'linkedin',
        sheetUrl = null,
        brandLogoText = 'Rahul Saini',
        captionPromptTemplate = payload.captionPromptTemplate || payload.caption_prompt_template || null,
        imagePromptTemplate = payload.imagePromptTemplate || payload.image_prompt_template || null,
        autoPublish = true,
    } = payload;

    const { data, error } = await getClient()
        .from('content_pipelines')
        .insert({
            workspace_id: workspaceId,
            user_id: userId,
            name,
            trigger_time: triggerTime,
            target_platforms: targetPlatforms,
            page_id: pageId,
            provider,
            sheet_url: sheetUrl,
            brand_logo_text: brandLogoText,
            caption_prompt_template: captionPromptTemplate,
            image_prompt_template: imagePromptTemplate,
            auto_publish: autoPublish,
            approver_phones: normalizePipelineApprovers(payload.approverPhones ?? payload.approver_phones),
            status: 'active',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const updatePipeline = async (pipelineId, workspaceId, patch) => {
    const updateData = {};
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.triggerTime !== undefined) updateData.trigger_time = patch.triggerTime;
    if (patch.targetPlatforms !== undefined) updateData.target_platforms = patch.targetPlatforms;
    if (patch.pageId !== undefined) updateData.page_id = patch.pageId;
    if (patch.provider !== undefined) updateData.provider = patch.provider;
    if (patch.sheetUrl !== undefined) updateData.sheet_url = patch.sheetUrl;
    if (patch.brandLogoText !== undefined) updateData.brand_logo_text = patch.brandLogoText;
    if (patch.captionPromptTemplate !== undefined) updateData.caption_prompt_template = patch.captionPromptTemplate;
    if (patch.caption_prompt_template !== undefined) updateData.caption_prompt_template = patch.caption_prompt_template;
    if (patch.imagePromptTemplate !== undefined) updateData.image_prompt_template = patch.imagePromptTemplate;
    if (patch.image_prompt_template !== undefined) updateData.image_prompt_template = patch.image_prompt_template;
    if (patch.autoPublish !== undefined) updateData.auto_publish = patch.autoPublish;
    if (patch.approverPhones !== undefined || patch.approver_phones !== undefined) {
        updateData.approver_phones = normalizePipelineApprovers(patch.approverPhones ?? patch.approver_phones);
    }
    if (patch.status !== undefined) updateData.status = patch.status;

    const allowedAliases = ['trigger_time', 'target_platforms', 'page_id', 'sheet_url', 'brand_logo_text', 'auto_publish'];
    for (const key of allowedAliases) {
        if (patch[key] !== undefined) {
            updateData[key] = patch[key];
        }
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await getClient()
        .from('content_pipelines')
        .update(updateData)
        .eq('id', pipelineId)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deletePipeline = async (pipelineId, workspaceId) => {
    const { error } = await getClient()
        .from('content_pipelines')
        .delete()
        .eq('id', pipelineId)
        .eq('workspace_id', workspaceId);

    if (error) throw error;
    return { success: true };
};

export const getQueueItems = async (pipelineId, workspaceId) => {
    const { data, error } = await getClient()
        .from('content_queue')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
};

export const addQueueItems = async (pipelineId, workspaceId, items = []) => {
    if (!items.length) return [];
    await getPipelineById(pipelineId, workspaceId);

    const normalized = items.map(normalizeContentItem)
        .filter(item => !item.sourceStatus || item.sourceStatus.toLowerCase() === 'pending');
    const existing = await getQueueItems(pipelineId, workspaceId);
    // Preserve already-generated content when the same source is imported again.
    const identity = row => JSON.stringify([row.day || '', row.dateStr || row.date_str || '', row.titleHook || row.title_hook || '']);
    const seen = new Set(existing.map(identity));
    const fresh = normalized.filter(item => {
        const key = identity(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (!fresh.length) return [];

    const rows = fresh.map((i) => ({
        pipeline_id: pipelineId,
        workspace_id: workspaceId,
        day: String(i.day || i.Day || '').slice(0, 49),
        date_str: String(i.dateStr || i.date || i.Date || '').slice(0, 49),
        title_hook: String(i.titleHook || i['Post Title / Hook'] || i.title || i.Title || 'Untitled Post'),
        content_pillar: i.contentPillar,
        caption_outline: String(i.captionOutline || i['Caption Outline'] || i.outline || i.Outline || ''),
        format: i.format,
        cta: String(i.cta || i.CTA || ''),
        status: 'pending',
    }));

    const { data, error } = await getClient()
        .from('content_queue')
        .insert(rows)
        .select();

    if (error) throw error;
    return data;
};

export const clearQueueItems = async (pipelineId, workspaceId) => {
    const { error } = await getClient()
        .from('content_queue')
        .delete()
        .eq('pipeline_id', pipelineId)
        .eq('workspace_id', workspaceId);

    if (error) throw error;
    return { success: true };
};
