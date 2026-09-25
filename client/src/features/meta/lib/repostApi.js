import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

export async function repostApi(workspaceId, path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in to manage reposts');
    const response = await fetch(`${API_BASE_URL}/api/reposts${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${session.access_token}`,
            'x-workspace-id': workspaceId, 'Content-Type': 'application/json', ...options.headers },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Repost request failed');
    return data;
}
