import { parseContentCSV, normalizeContentItem, buildPipelineImagePrompt } from '../../shared/utils/pipeline-content.mjs';
import { reserveUsage, releaseUsage } from '../billing/billing.service.js';
/**
 * Pipeline Execution Engine
 *
 * Automates content generation (captions + images) and social publishing
 * based on input rows (from Google Sheets or content_queue).
 *
 * Mirrors the n8n automation pipeline:
 * 1. Fetch next "pending" row from Google Sheet / content_queue
 * 2. Generate AI Caption (Structured JSON with caption + hashtags) via OpenAI / Perplexity
 * 3. Generate AI Image Banner via OpenAI DALL-E (or fallback graphic renderer)
 * 4. Create post in scheduled_posts & publish via LinkedInService / MetaService (or queue for approval)
 * 5. Update row status to "posted" / "scheduled"
 */

import '../../config/env.js';
import { supabaseAdmin, supabase } from '../../config/supabase.js';
import MetaService from '../meta/meta.service.js';
import LinkedInService from '../linkedin/linkedin.service.js';
import { decryptData } from '../../shared/utils/encryption.js';
import sharp from 'sharp';
import { getDefaultApprovers, requestApproval } from '../approvals/approval.service.js';
import { isWhatsAppEnabled } from '../whatsapp/whatsapp.service.js';
import { addQueueItems } from './pipeline.service.js';

const getClient = () => supabaseAdmin || supabase;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || null;

/**
 * Fetch rows from a public Google Sheet CSV export or sheet URL
 */
export const fetchGoogleSheetRows = async (sheetUrlOrId) => {
    if (!sheetUrlOrId) return [];

    let sheetId = sheetUrlOrId;
    const match = sheetUrlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
        const response = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Google Sheets export returned HTTP ${response.status}`);

        const csvText = await response.text();
        return parseContentCSV(csvText);
    } catch (err) {
        console.error('[PipelineExecutor] Failed to fetch Google Sheet:', err.message);
        throw new Error(`Google Sheet fetch failed: ${err.message}`);
    }
};

/**
 * Generate AI Caption & Hashtags using OpenAI or Perplexity
 */
export const generatePipelineCaption = async ({
    titleHook,
    contentPillar,
    captionOutline,
    format,
    cta,
    customTemplate,
}) => {
    const apiKey = OPENAI_API_KEY || PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Neither OPENAI_API_KEY nor PERPLEXITY_API_KEY is configured on the server');
    }

    const defaultPrompt = `You write LinkedIn captions for a full-stack developer / AI automation specialist.
Return ONLY a JSON object with two keys: "caption" (80-150 words, first-person, short paragraphs, ends with the given CTA) and "hashtags" (5-8 hashtags as one space-separated string).

Post Title: ${titleHook}
Content Pillar: ${contentPillar || 'Tech & AI'}
Caption Outline: ${captionOutline || titleHook}
Format: ${format || 'Story/Insight'}
CTA: ${cta || 'Follow for more tech insights'}`;

    const prompt = customTemplate
        ? customTemplate
            .replace(/\{\{titleHook\}\}/g, titleHook)
            .replace(/\{\{contentPillar\}\}/g, contentPillar || '')
            .replace(/\{\{captionOutline\}\}/g, captionOutline || '')
            .replace(/\{\{format\}\}/g, format || '')
            .replace(/\{\{cta\}\}/g, cta || '')
        : defaultPrompt;

    const isPerplexity = !OPENAI_API_KEY && Boolean(PERPLEXITY_API_KEY);
    const endpoint = isPerplexity
        ? 'https://api.perplexity.ai/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const model = isPerplexity ? 'sonar' : 'gpt-4o';

    const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(isPerplexity ? {} : { response_format: { type: 'json_object' } }),
        temperature: 0.7,
    };

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI Caption API failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();

    if (!rawContent) throw new Error('AI returned an empty caption response');

    let parsed;
    try {
        const cleaned = rawContent.replace(/^```json\s*|\s*```$/gi, '').trim();
        parsed = JSON.parse(cleaned);
    } catch {
        parsed = {
            caption: rawContent,
            hashtags: '#AI #Tech #Automation #SaaS #Innovation',
        };
    }

    return {
        caption: parsed.caption || rawContent,
        hashtags: parsed.hashtags || '',
    };
};

import { isOpenAIConfigured, generateImage } from '../design/generation.service.js';
import { isBunnyConfigured, bunnyUpload } from '../../shared/storage/bunny.js';

/**
 * Generate Image Banner via OpenAI Image API (design module) & upload to storage
 */
export const generatePipelineImage = async ({
    titleHook,
    contentPillar,
    captionOutline,
    caption,
    brandLogoText = 'Rahul Saini',
    customTemplate,
    userId = 'system',
    workspaceId = null,
}) => {
    if (!isOpenAIConfigured()) {
        console.warn('[PipelineExecutor] OPENAI_API_KEY missing — skipping image generation.');
        return null;
    }

    const prompt = buildPipelineImagePrompt({ titleHook, contentPillar, captionOutline, caption, brandLogoText, customTemplate });

    try {
        const { buffer, contentType } = await generateImage({
            prompt,
            imageSize: '1024x1024',
            quality: 'low',
        });

        if (!buffer) return null;

        // Convert generated image buffer to JPEG (Instagram Graph API strictly requires image/jpeg, code 9004/2207052)
        let finalBuffer = buffer;
        let mimeType = 'image/jpeg';
        let fileExtension = 'jpg';
        try {
            finalBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        } catch (sharpErr) {
            console.warn('[PipelineExecutor] sharp conversion to JPEG failed, using original buffer:', sharpErr.message);
            finalBuffer = buffer;
            mimeType = contentType || 'image/png';
            fileExtension = 'png';
        }

        const safeTitle = titleHook ? titleHook.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) : 'banner';
        const fileName = `pipeline-${safeTitle}-${Date.now()}.${fileExtension}`;
        const prefix = workspaceId ? `library/${workspaceId}/${userId}` : `library/${userId}`;
        const objectKey = `${prefix}/${Date.now()}-${fileName}`;
        const sizeBytes = finalBuffer.length;

        let publicUrl = null;
        const useBunny = isBunnyConfigured();

        if (useBunny) {
            try {
                publicUrl = await bunnyUpload(objectKey, finalBuffer, mimeType);
                console.log(`[PipelineExecutor] Uploaded pipeline image to Bunny Storage: ${publicUrl}`);
            } catch (bunnyErr) {
                console.error('[PipelineExecutor] Bunny storage upload failed, falling back to Supabase:', bunnyErr.message);
            }
        }

        if (!publicUrl) {
            const { error } = await getClient().storage.from('post-media')
                .upload(objectKey, finalBuffer, { contentType: mimeType, upsert: true });

            if (!error) {
                publicUrl = getClient().storage.from('post-media').getPublicUrl(objectKey).data.publicUrl;
            }
        }

        // Register in media_library table so it appears in the Media Library UI
        if (publicUrl && userId && userId !== 'system') {
            try {
                await getClient().from('media_library').insert({
                    user_id: userId,
                    workspace_id: workspaceId || null,
                    object_key: objectKey,
                    url: publicUrl,
                    file_name: fileName,
                    mime_type: mimeType,
                    size_bytes: sizeBytes,
                });
                console.log(`[PipelineExecutor] Registered generated image in Media Library: ${publicUrl}`);
            } catch (dbErr) {
                console.warn('[PipelineExecutor] Failed to insert generated image into media_library:', dbErr.message);
            }
        }

        return publicUrl || `data:${mimeType};base64,${finalBuffer.toString('base64')}`;
    } catch (err) {
        console.warn('[PipelineExecutor] Image generation failed:', err.message);
        return null;
    }
};

/**
 * Execute a Pipeline run (Processes the next pending row)
 */
export const runPipeline = async (pipelineId, workspaceId) => {
    if (!workspaceId) throw new Error('Active workspace is required to run a pipeline');
    const db = getClient();

    // 1. Fetch Pipeline config
    const { data: pipeline, error: pipeError } = await db
        .from('content_pipelines')
        .select('*')
        .eq('id', pipelineId)
        .eq('workspace_id', workspaceId)
        .single();

    if (pipeError || !pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status !== 'active') {
        console.log(`[PipelineExecutor] Pipeline ${pipeline.name} is paused. Skipping.`);
        return { status: 'skipped', reason: 'pipeline_paused' };
    }

    // 2. Fetch Next Pending Item from content_queue
    let { data: queueItems } = await db
        .from('content_queue')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    let item = queueItems?.[0] || null;

    // If queue is empty and sheet_url is set, attempt to sync from Google Sheet
    if (!item && pipeline.sheet_url) {
        try {
            console.log(`[PipelineExecutor] Content queue empty. Syncing from Google Sheet: ${pipeline.sheet_url}`);
            const sheetRows = await fetchGoogleSheetRows(pipeline.sheet_url);
            const imported = await addQueueItems(pipelineId, pipeline.workspace_id, sheetRows);
            item = imported[0] || null;
        } catch (syncErr) {
            console.error('[PipelineExecutor] Google Sheet sync error:', syncErr.message);
            throw syncErr;
        }
    }

    if (!item) {
        console.log(`[PipelineExecutor] No pending content items for pipeline ${pipeline.name}.`);
        return { status: 'no_pending_items' };
    }

    console.log(`[PipelineExecutor] Processing item "${item.title_hook}" for pipeline "${pipeline.name}"...`);

    // Refuse corrupted legacy imports before spending generation credits.
    normalizeContentItem(item);

    // Mark status as generating
    const { data: claimed, error: claimError } = await db
        .from('content_queue').update({ status: 'generating' })
        .eq('id', item.id).eq('status', 'pending').select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return { status: 'skipped', reason: 'already_claimed' };

    let generationReservation;
    let autoReservation;
    let generated = false;
    let publishAttempted = false;
    let scheduledPostId = null;
    let approvalDelivery = null;
    try {
        const approverPhones = pipeline.auto_publish ? [] : pipeline.approver_phones?.length
            ? pipeline.approver_phones : await getDefaultApprovers(pipeline.workspace_id);
        if (pipeline.auto_publish) autoReservation = await reserveUsage(pipeline.user_id, pipeline.workspace_id, 'trial_auto_posts');
        generationReservation = await reserveUsage(pipeline.user_id, pipeline.workspace_id);
        // 3. Generate AI Caption
        console.log('[PipelineExecutor] Generating AI caption...');
        const { caption, hashtags } = await generatePipelineCaption({
            titleHook: item.title_hook,
            contentPillar: item.content_pillar,
            captionOutline: item.caption_outline,
            format: item.format,
            cta: item.cta,
            customTemplate: pipeline.caption_prompt_template,
        });

        generated = true;
        const fullText = `${caption}\n\n${hashtags}`.trim();

        // 4. Generate AI Image
        console.log('[PipelineExecutor] Generating AI image banner...');
        const imageUrl = await generatePipelineImage({
            titleHook: item.title_hook,
            contentPillar: item.content_pillar,
            captionOutline: item.caption_outline,
            caption: fullText,
            brandLogoText: pipeline.brand_logo_text,
            customTemplate: pipeline.image_prompt_template,
            userId: pipeline.user_id,
            workspaceId: pipeline.workspace_id,
        });

        const mediaUrls = imageUrl ? [imageUrl] : [];

        // 5. Create Scheduled Post or Publish
        const targetPlatforms = pipeline.target_platforms || ['linkedin'];
        const provider = pipeline.provider || 'linkedin';

        let activeLiConn = null;
        let activeMetaConn = null;
        let linkedinConnectionId = null;
        let metaConnectionId = null;
        let targetPageId = pipeline.page_id;

        if (provider === 'linkedin') {
            const { data: liConn } = await db
                .from('linkedin_connections')
                .select('*')
                .eq('workspace_id', pipeline.workspace_id)
                .eq('is_active', true)
                .maybeSingle();

            if (!liConn) {
                throw new Error('No active LinkedIn account connected in this workspace. Please connect LinkedIn first under Social Profiles.');
            }
            activeLiConn = liConn;
            linkedinConnectionId = liConn.id;
            if (!targetPageId || targetPageId === 'pipeline_auto_post') {
                targetPageId = liConn.author_urn;
            }
        } else {
            const { data: metaConn } = await db
                .from('meta_connections')
                .select('*')
                .eq('workspace_id', pipeline.workspace_id)
                .eq('is_active', true)
                .maybeSingle();

            if (!metaConn) {
                throw new Error('No active Facebook/Instagram account connected in this workspace. Please connect Meta first under Social Profiles.');
            }
            activeMetaConn = metaConn;
            metaConnectionId = metaConn.id;

            let realPageId = (pipeline.page_id && pipeline.page_id !== 'meta_page' && pipeline.page_id !== 'pipeline_auto_post')
                ? pipeline.page_id
                : null;

            if (!realPageId) {
                if (Array.isArray(metaConn.selected_page_ids) && metaConn.selected_page_ids.length > 0) {
                    realPageId = metaConn.selected_page_ids[0];
                } else if (Array.isArray(metaConn.pages) && metaConn.pages.length > 0) {
                    realPageId = metaConn.pages[0].id;
                } else if (metaConn.page_id && metaConn.page_id !== 'meta_page') {
                    realPageId = metaConn.page_id;
                }
            }

            if (!realPageId) {
                const decryptedToken = decryptData(metaConn.access_token);
                if (decryptedToken) {
                    const metaService = new MetaService(decryptedToken);
                    const pagesRes = await metaService.getPages();
                    if (pagesRes.success && pagesRes.pages?.length > 0) {
                        realPageId = pagesRes.pages[0].id;
                    }
                }
            }

            if (!realPageId) {
                throw new Error('No Facebook Page found on your connected Meta account. Please connect a Facebook Page in Meta settings.');
            }

            targetPageId = realPageId;
        }

        let resolvedPageName = pipeline.name;
        if (provider === 'meta' && activeMetaConn) {
            const pageObj = (activeMetaConn.pages || []).find((p) => String(p.id) === String(targetPageId));
            if (pageObj?.name) {
                resolvedPageName = pageObj.name;
            }
        } else if (provider === 'linkedin' && activeLiConn) {
            resolvedPageName = activeLiConn.name || 'LinkedIn';
        }

        const postPayload = {
            workspace_id: pipeline.workspace_id,
            user_id: pipeline.user_id,
            provider,
            ...(linkedinConnectionId ? { linkedin_connection_id: linkedinConnectionId } : {}),
            ...(metaConnectionId ? { meta_connection_id: metaConnectionId } : {}),
            page_id: targetPageId,
            page_name: resolvedPageName,
            platforms: targetPlatforms,
            content: fullText,
            media_urls: mediaUrls,
            scheduled_time: new Date().toISOString(),
            status: pipeline.auto_publish ? 'processing' : 'pending_approval',
            approver_phones: approverPhones,
        };

        if (pipeline.auto_publish) {
            const { data: postRow, error: postErr } = await db
                .from('scheduled_posts')
                .insert(postPayload)
                .select()
                .single();

            if (postErr) throw postErr;
            scheduledPostId = postRow.id;

            // Trigger immediate publish via connected provider
            if (provider === 'linkedin' && activeLiConn) {
                const decryptedToken = decryptData(activeLiConn.access_token);
                const liService = new LinkedInService(decryptedToken);
                const authorUrn = targetPageId || activeLiConn.author_urn;

                publishAttempted = true;
                const res = await liService.publishPost(authorUrn, {
                    commentary: fullText,
                    mediaUrls,
                });

                if (res.success) {
                    const { error: publishSaveError } = await db
                        .from('scheduled_posts')
                        .update({
                            status: 'published',
                            published_at: new Date().toISOString(),
                            meta_post_id: res.postUrn,
                            publish_results: { linkedin: { success: true, postId: res.postUrn } },
                        })
                        .eq('id', scheduledPostId);
                    if (publishSaveError) throw publishSaveError;
                } else {
                    await db.from('scheduled_posts').update({ status: 'failed', error_message: res.error })
                        .eq('id', scheduledPostId);
                    throw new Error(`LinkedIn publish error: ${res.error}`);
                }
            } else if (provider === 'meta' && activeMetaConn) {
                const decryptedToken = decryptData(activeMetaConn.access_token);
                const metaService = new MetaService(decryptedToken);
                let pageId = targetPageId;
                if (!pageId || pageId === 'pipeline_auto_post' || pageId === 'meta_page') {
                    pageId = activeMetaConn.pages?.[0]?.id || activeMetaConn.page_id;
                }
                if (!pageId) {
                    throw new Error('No valid Facebook Page found on your connected Meta account.');
                }

                const tokenResult = await metaService.getPageToken(pageId);
                if (!tokenResult.success) {
                    throw new Error(`Meta page token error: ${tokenResult.error}`);
                }

                const { pageAccessToken } = tokenResult;
                const publishResults = {};

                if (targetPlatforms.includes('facebook') || targetPlatforms.includes('meta')) {
                    publishAttempted = true;
                    const fb = await metaService.publishPost(pageId, pageAccessToken, {
                        message: fullText,
                        mediaUrls,
                    });
                    const fbPostId = fb.data?.post_id || fb.data?.id;
                    const fbPermalink = fbPostId ? `https://facebook.com/${fbPostId}` : null;
                    publishResults.facebook = fb.success
                        ? { success: true, postId: fbPostId, permalink: fbPermalink }
                        : { success: false, error: fb.error };
                }

                if (targetPlatforms.includes('instagram')) {
                    const igAccount = await metaService.getInstagramAccount(pageId, pageAccessToken);
                    if (igAccount.success) {
                        publishAttempted = true;
                        const ig = await metaService.publishInstagramPost(
                            igAccount.instagramAccount.id,
                            pageAccessToken,
                            { caption: fullText, mediaUrls }
                        );
                        publishResults.instagram = ig.success
                            ? { success: true, postId: ig.data?.id }
                            : { success: false, error: ig.error };
                    } else {
                        publishResults.instagram = { success: false, error: igAccount.error };
                    }
                }

                const anySuccess = Object.values(publishResults).some((r) => r.success);
                const mainPostId = publishResults.facebook?.postId || publishResults.instagram?.postId;
                const { error: publishSaveError } = await db
                    .from('scheduled_posts')
                    .update({
                        status: anySuccess ? 'published' : 'failed',
                        published_at: anySuccess ? new Date().toISOString() : null,
                        meta_post_id: mainPostId || null,
                        publish_results: publishResults,
                    })
                    .eq('id', scheduledPostId);
                if (publishSaveError) throw publishSaveError;

                if (!anySuccess) {
                    const errors = Object.entries(publishResults)
                        .map(([p, r]) => `${p}: ${r.error}`)
                        .join('; ');
                    throw new Error(`Meta publish failed: ${errors}`);
                }
            }
        } else {
            // Send to Approval Queue
            const { data: postRow, error: postErr } = await db
                .from('scheduled_posts')
                .insert(postPayload)
                .select()
                .single();

            if (postErr) throw postErr;
            scheduledPostId = postRow.id;
        }

        if (!pipeline.auto_publish) {
            approvalDelivery = !approverPhones.length
                ? { sent: false, error: 'No approval numbers configured. Add WhatsApp numbers in pipeline settings or workspace defaults, or review in Approval Queue.' }
                : !isWhatsAppEnabled()
                    ? { sent: false, error: 'WhatsApp is not configured. Review this post in Approval Queue.' }
                    : await requestApproval({ ...postPayload, id: scheduledPostId }).catch(err => ({ sent: false, error: err.message }));
        }

        // 6. Update Queue Row Status
        const { data: finalPost, error: finalPostError } = await db.from('scheduled_posts').select('status')
            .eq('id', scheduledPostId).eq('workspace_id', workspaceId).single();
        if (finalPostError) throw finalPostError;
        const { error: queueUpdateError } = await db
            .from('content_queue')
            .update({
                status: finalPost.status === 'pending' ? 'scheduled' : finalPost.status,
                generated_caption: caption,
                generated_hashtags: hashtags,
                generated_image_url: imageUrl,
                scheduled_post_id: scheduledPostId,
                updated_at: new Date().toISOString(),
                error_message: approvalDelivery && !approvalDelivery.sent ? approvalDelivery.error : null,
            })
            .eq('id', item.id);
        if (queueUpdateError) throw queueUpdateError;

        // Update pipeline last_run_at
        await db
            .from('content_pipelines')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', pipelineId);

        console.log(`[PipelineExecutor] Item "${item.title_hook}": ${finalPost.status}`);

        return {
            status: 'success',
            itemId: item.id,
            titleHook: item.title_hook,
            caption,
            imageUrl,
            scheduledPostId,
            postStatus: finalPost.status,
            approvalDelivery,
        };
    } catch (err) {
        if (!generated) await releaseUsage(generationReservation);
        if (!publishAttempted) await releaseUsage(autoReservation);
        console.error(`❌ [PipelineExecutor] Failed to process item "${item.title_hook}":`, err.message);
        if (scheduledPostId && !publishAttempted) {
            await db.from('scheduled_posts').update({ status: 'failed', error_message: err.message })
                .eq('id', scheduledPostId).eq('status', 'processing');
        }

        await db
            .from('content_queue')
            .update({
                status: 'failed',
                ...(scheduledPostId ? { scheduled_post_id: scheduledPostId } : {}),
                error_message: err.message,
                updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

        throw err;
    }
};
