import API_BASE_URL from '@/shared/config';
import { supabase } from '@/shared/lib/supabase';

const headers = async (workspaceId) => {
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
  };
};

const request = async (path, workspaceId, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: await headers(workspaceId),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed');
  return data;
};

export const getCalendar = (workspaceId, from, to) => request(
  `/api/content?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  workspaceId,
);
export const getContentItem = (workspaceId, id) => request(`/api/content/${id}`, workspaceId);
export const createContentItem = (workspaceId, body) => request('/api/content', workspaceId, { method: 'POST', body });
export const createContentVersion = (workspaceId, id, body) => request(`/api/content/${id}/versions`, workspaceId, { method: 'POST', body });
export const addContentComment = (workspaceId, id, body) => request(`/api/content/${id}/comments`, workspaceId, { method: 'POST', body });
export const contentAction = (workspaceId, id, action, body = {}) => request(`/api/content/${id}/${action}`, workspaceId, { method: 'POST', body });
export const getBrand = (workspaceId) => request('/api/brand', workspaceId);
export const getReport = (workspaceId, from, to) => request(
  `/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  workspaceId,
);
export const previewWorkspaceInvite = (token) => request(`/api/workspaces/invites/${encodeURIComponent(token)}`, null);
export const acceptWorkspaceInvite = (token) => request(`/api/workspaces/invites/${encodeURIComponent(token)}/accept`, null, { method: 'POST', body: {} });
export const getWorkspaceMembers = (workspaceId) => request(`/api/workspaces/${workspaceId}/members`, null);
export const getWorkspaceInvites = (workspaceId) => request(`/api/workspaces/${workspaceId}/invites`, null);
export const inviteClient = (workspaceId, email) => request(`/api/workspaces/${workspaceId}/invites`, null, { method: 'POST', body: { email, role: 'client' } });
export const saveBrand = (workspaceId, body) => request('/api/brand', workspaceId, { method: 'PUT', body });
export const getConnectedDestinations = async (workspaceId) => {
  const [meta, linkedin] = await Promise.all([
    request('/api/meta/connection', workspaceId),
    request('/api/linkedin/connection', workspaceId),
  ]);
  const destinations = [];
  if (meta.connected && meta.isValid) {
    for (const page of meta.pages || []) {
      destinations.push({ id: String(page.id), name: page.name, provider: 'meta', type: 'Facebook Page', platforms: ['facebook'] });
      if (page.instagram_business_account?.id) {
        destinations.push({ id: String(page.id), name: `${page.name} + Instagram`, provider: 'meta', type: 'Facebook + Instagram', platforms: ['facebook', 'instagram'] });
      }
    }
  }
  if (linkedin.connected && linkedin.isValid) {
    for (const actor of linkedin.actors || []) {
      if (actor.type === 'org' && !linkedin.canPostAsOrg) continue;
      destinations.push({ id: actor.urn, name: actor.name, provider: 'linkedin', type: actor.type === 'org' ? 'Company Page' : 'Profile', platforms: ['linkedin'] });
    }
  }
  return destinations;
};
