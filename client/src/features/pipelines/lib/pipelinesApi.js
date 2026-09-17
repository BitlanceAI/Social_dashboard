import API_BASE_URL from '@/shared/config';
import { supabase } from '@/shared/lib/supabase';

const authHeaders = async (workspaceId) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const cleanWorkspaceId = (workspaceId && workspaceId !== 'null' && workspaceId !== 'undefined') ? workspaceId : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cleanWorkspaceId ? { 'x-workspace-id': cleanWorkspaceId } : {}),
    };
};

export const fetchPipelines = async (workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines`, {
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch pipelines');
    return data.pipelines || [];
};

export const createPipeline = async (payload, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines`, {
        method: 'POST',
        headers: await authHeaders(workspaceId),
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create pipeline');
    return data.pipeline;
};

export const updatePipeline = async (id, patch, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}`, {
        method: 'PUT',
        headers: await authHeaders(workspaceId),
        body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update pipeline');
    return data.pipeline;
};

export const deletePipeline = async (id, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}`, {
        method: 'DELETE',
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete pipeline');
    return data;
};

export const runPipelineNow = async (id, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}/run`, {
        method: 'POST',
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to execute pipeline');
    return data.result;
};

export const fetchPipelineQueue = async (id, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}/queue`, {
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch queue');
    return data.queue || [];
};

export const syncPipelineSheet = async (id, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}/sync-sheet`, {
        method: 'POST',
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sync Google Sheet');
    return data;
};

export const importPipelineItems = async (id, items, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}/import`, {
        method: 'POST',
        headers: await authHeaders(workspaceId),
        body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import items');
    return data;
};

export const clearPipelineQueue = async (id, workspaceId) => {
    const res = await fetch(`${API_BASE_URL}/api/pipelines/${id}/queue`, {
        method: 'DELETE',
        headers: await authHeaders(workspaceId),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to clear queue');
    return data;
};
