import { supabase } from '@/shared/lib/supabase';
import API_BASE_URL from '@/shared/config';

const authHeaders = async (workspaceId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    return {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
    };
};

/** GET /api/approvals/approvers — saved approver numbers for this workspace */
export const getSavedApprovers = async (workspaceId) => {
    try {
        const res = await fetch(`${API_BASE_URL}/api/approvals/approvers`, {
            headers: await authHeaders(workspaceId),
        });
        const payload = await res.json().catch(() => ({}));
        return Array.isArray(payload.phones) ? payload.phones : [];
    } catch {
        return [];
    }
};
