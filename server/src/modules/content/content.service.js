import '../../config/env.js';

import { supabaseAdmin as db } from '../../config/supabase.js';

const EDITOR_ROLES = new Set(['owner', 'admin', 'member']);
const APPROVER_ROLES = new Set(['owner', 'admin', 'client']);

const cleanText = (value, max = 20000) => String(value ?? '').trim().slice(0, max);
const cleanUrls = (value) => Array.isArray(value)
    ? value.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)).slice(0, 10)
    : [];

const getItem = async (workspaceId, id) => {
    const { data, error } = await db.from('content_items')
        .select('*, current_version:content_versions!content_items_current_version_fk(*)')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) Object.assign(new Error('Content item not found'), { status: 404 });
    return data;
};

const event = async (item, actorId, action, reason = null, versionId = null) => {
    const { error } = await db.from('content_approval_events').insert({
        workspace_id: item.workspace_id,
        content_item_id: item.id,
        content_version_id: versionId ?? item.current_version_id,
        actor_id: actorId,
        action,
        reason: reason || null,
    });
    if (error) throw error;
};

export const listContent = async (workspaceId, query, role) => {
    const now = new Date();
    const fallbackFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const fallbackTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const from = query.from && !Number.isNaN(Date.parse(query.from)) ? new Date(query.from).toISOString() : fallbackFrom;
    const to = query.to && !Number.isNaN(Date.parse(query.to)) ? new Date(query.to).toISOString() : fallbackTo;

    let request = db.from('content_items')
        .select('*, current_version:content_versions!content_items_current_version_fk(*)')
        .eq('workspace_id', workspaceId)
        .gte('planned_for', from).lt('planned_for', to)
        .order('planned_for', { ascending: true })
        .order('id', { ascending: true })
        .limit(500);
    if (query.status) request = request.eq('review_status', query.status);
    if (role === 'client') request = request.in('review_status', ['client_review', 'changes_requested', 'approved', 'scheduled', 'published', 'failed']);
    const { data, error } = await request;
    if (error) throw error;
    return { items: data || [], range: { from, to } };
};

export const loadContent = async (workspaceId, id, role) => {
    const item = await getItem(workspaceId, id);
    if (role === 'client' && ['draft', 'internal_review'].includes(item.review_status)) {
        Object.assign(new Error('Content item not found'), { status: 404 });
    }
    const [{ data: versions, error: versionError }, { data: comments, error: commentError }, { data: activity, error: activityError }] = await Promise.all([
        db.from('content_versions').select('*').eq('workspace_id', workspaceId).eq('content_item_id', id).order('version_number', { ascending: false }),
        db.from('content_comments').select('*').eq('workspace_id', workspaceId).eq('content_item_id', id).is('deleted_at', null).order('created_at'),
        db.from('content_approval_events').select('*').eq('workspace_id', workspaceId).eq('content_item_id', id).order('created_at'),
    ]);
    if (versionError || commentError || activityError) throw versionError || commentError || activityError;
    return {
        ...item,
        versions: versions || [],
        comments: (comments || []).filter((comment) => role !== 'client' || comment.visibility === 'shared'),
        activity: activity || [],
    };
};

export const createContent = async (workspaceId, userId, payload) => {
    const caption = cleanText(payload.caption);
    if (!caption) Object.assign(new Error('Caption is required'), { status: 400 });
    const provider = payload.provider === 'linkedin' ? 'linkedin' : 'meta';
    const plannedFor = payload.plannedFor && !Number.isNaN(Date.parse(payload.plannedFor)) ? new Date(payload.plannedFor).toISOString() : null;

    const { data: item, error } = await db.from('content_items').insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: cleanText(payload.title, 160) || 'Untitled post',
        campaign_name: cleanText(payload.campaignName, 160) || null,
        provider,
        destination: payload.destination && typeof payload.destination === 'object' ? payload.destination : {},
        planned_for: plannedFor,
        timezone: cleanText(payload.timezone, 80) || 'Asia/Kolkata',
    }).select().single();
    if (error) throw error;

    const { data: version, error: versionError } = await db.from('content_versions').insert({
        workspace_id: workspaceId,
        content_item_id: item.id,
        version_number: 1,
        caption,
        media_urls: cleanUrls(payload.mediaUrls),
        link_url: cleanText(payload.linkUrl, 2048) || null,
        created_by: userId,
    }).select().single();
    if (versionError) {
        await db.from('content_items').delete().eq('id', item.id);
        throw versionError;
    }
    const { data: updated, error: updateError } = await db.from('content_items')
        .update({ current_version_id: version.id }).eq('id', item.id).select().single();
    if (updateError) throw updateError;
    await event(updated, userId, 'created', null, version.id);
    return { ...updated, current_version: version };
};

export const createVersion = async (workspaceId, id, userId, role, payload) => {
    if (!EDITOR_ROLES.has(role)) Object.assign(new Error('Only agency team members can revise content'), { status: 403 });
    const item = await getItem(workspaceId, id);
    if (['scheduled', 'published', 'cancelled'].includes(item.review_status)) {
        Object.assign(new Error('This content can no longer be revised'), { status: 409 });
    }
    const caption = cleanText(payload.caption);
    if (!caption) Object.assign(new Error('Caption is required'), { status: 400 });
    const { data: latest, error: latestError } = await db.from('content_versions')
        .select('version_number').eq('content_item_id', id).order('version_number', { ascending: false }).limit(1).single();
    if (latestError) throw latestError;
    const { data: version, error } = await db.from('content_versions').insert({
        workspace_id: workspaceId,
        content_item_id: id,
        version_number: latest.version_number + 1,
        caption,
        media_urls: cleanUrls(payload.mediaUrls),
        link_url: cleanText(payload.linkUrl, 2048) || null,
        created_by: userId,
    }).select().single();
    if (error) throw error;
    const wasApproved = Boolean(item.approved_version_id);
    const { error: updateError } = await db.from('content_items').update({
        current_version_id: version.id,
        approved_version_id: null,
        review_status: 'changes_requested',
        updated_at: new Date().toISOString(),
    }).eq('id', id).eq('current_version_id', item.current_version_id);
    if (updateError) throw updateError;
    await event(item, userId, wasApproved ? 'approval_invalidated' : 'revised', null, version.id);
    return version;
};

export const transitionContent = async (workspaceId, id, userId, role, action, reason = '') => {
    const item = await getItem(workspaceId, id);
    const transitions = {
        submit_internal: { from: ['draft', 'changes_requested'], to: 'internal_review', roles: EDITOR_ROLES },
        submit_client: { from: ['draft', 'internal_review', 'changes_requested'], to: 'client_review', roles: EDITOR_ROLES },
        request_changes: { from: ['internal_review', 'client_review', 'approved'], to: 'changes_requested', roles: APPROVER_ROLES },
        approve: { from: ['client_review'], to: 'approved', roles: APPROVER_ROLES },
        cancel: { from: ['draft', 'internal_review', 'client_review', 'changes_requested', 'approved'], to: 'cancelled', roles: new Set(['owner', 'admin']) },
    };
    const rule = transitions[action];
    if (!rule) Object.assign(new Error('Unsupported transition'), { status: 400 });
    if (!rule.roles.has(role)) Object.assign(new Error('You cannot perform this review action'), { status: 403 });
    if (!rule.from.includes(item.review_status)) Object.assign(new Error(`Cannot ${action.replace('_', ' ')} content that is ${item.review_status}`), { status: 409 });
    if (action === 'request_changes' && !cleanText(reason, 4000)) Object.assign(new Error('A change request must include feedback'), { status: 400 });

    const patch = { review_status: rule.to, updated_at: new Date().toISOString() };
    if (action === 'approve') patch.approved_version_id = item.current_version_id;
    else if (action === 'request_changes') patch.approved_version_id = null;
    const { data, error } = await db.from('content_items').update(patch)
        .eq('id', id).eq('workspace_id', workspaceId).eq('review_status', item.review_status)
        .select().maybeSingle();
    if (error) throw error;
    if (!data) Object.assign(new Error('Content changed while you were reviewing it. Reload and try again.'), { status: 409 });
    await event(data, userId, action, cleanText(reason, 4000) || null);
    return data;
};

export const addComment = async (workspaceId, id, userId, role, payload) => {
    const item = await getItem(workspaceId, id);
    if (role === 'client' && ['draft', 'internal_review'].includes(item.review_status)) Object.assign(new Error('Content item not found'), { status: 404 });
    const body = cleanText(payload.body, 4000);
    if (!body) Object.assign(new Error('Comment is required'), { status: 400 });
    const visibility = role === 'client' ? 'shared' : (payload.visibility === 'internal' ? 'internal' : 'shared');
    const { data, error } = await db.from('content_comments').insert({
        workspace_id: workspaceId, content_item_id: id, content_version_id: item.current_version_id,
        author_id: userId, body, visibility,
    }).select().single();
    if (error) throw error;
    await event(item, userId, 'commented', null);
    return data;
};

export const scheduleApprovedContent = async (workspaceId, id, userId, role) => {
    if (!['owner', 'admin', 'member'].includes(role)) Object.assign(new Error('Clients cannot schedule content'), { status: 403 });
    const item = await getItem(workspaceId, id);
    if (item.review_status !== 'approved' || item.current_version_id !== item.approved_version_id) {
        Object.assign(new Error('Only the current approved version can be scheduled'), { status: 409 });
    }
    if (!item.planned_for || new Date(item.planned_for).getTime() <= Date.now()) {
        Object.assign(new Error('Choose a future publishing time before scheduling'), { status: 400 });
    }
    const destination = item.destination || {};
    const connectionTable = item.provider === 'linkedin' ? 'linkedin_connections' : 'meta_connections';
    const { data: connection, error: connectionError } = await db.from(connectionTable)
        .select('id').eq('workspace_id', workspaceId).eq('is_active', true).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) Object.assign(new Error(`Connect ${item.provider === 'linkedin' ? 'LinkedIn' : 'Meta'} before scheduling`), { status: 409 });

    const version = item.current_version;
    const row = {
        workspace_id: workspaceId,
        user_id: userId,
        provider: item.provider,
        meta_connection_id: item.provider === 'meta' ? connection.id : null,
        linkedin_connection_id: item.provider === 'linkedin' ? connection.id : null,
        page_id: cleanText(destination.pageId || destination.actorId, 255),
        page_name: cleanText(destination.pageName || destination.actorName, 255) || null,
        platforms: Array.isArray(destination.platforms) ? destination.platforms : [item.provider === 'meta' ? 'facebook' : 'linkedin'],
        content: version.caption,
        media_urls: version.media_urls,
        link_url: version.link_url,
        scheduled_time: item.planned_for,
        timezone: item.timezone,
        status: 'pending',
        content_item_id: item.id,
        content_version_id: version.id,
    };
    if (!row.page_id) Object.assign(new Error('Choose a publishing destination before scheduling'), { status: 400 });
    const { data: scheduledPost, error } = await db.from('scheduled_posts').insert(row).select().single();
    if (error) {
        if (error.code === '23505') Object.assign(new Error('This approved version is already scheduled'), { status: 409 });
        throw error;
    }
    const { data: updated, error: updateError } = await db.from('content_items').update({
        scheduled_post_id: scheduledPost.id, review_status: 'scheduled', updated_at: new Date().toISOString(),
    }).eq('id', id).eq('approved_version_id', version.id).select().single();
    if (updateError) throw updateError;
    await event(updated, userId, 'scheduled', null, version.id);
    return { item: updated, scheduledPost };
};
