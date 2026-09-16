const PAGE_SIZE = 25;

export const parseQueuePage = (value = '1') => {
    if (!/^\d+$/.test(String(value))) return null;
    const page = Number(value);
    return Number.isSafeInteger(page) && page >= 1 && page <= 100000 ? page : null;
};

export const loadApprovalQueue = async (db, workspaceId, pendingPage = 1, approvedPage = 1) => {
    const base = () => db.from('scheduled_posts').select('*', { count: 'exact' }).eq('workspace_id', workspaceId);
    const range = (query, page) => query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const [pending, approved] = await Promise.all([
        range(base().eq('status', 'pending_approval').order('created_at', { ascending: false }).order('id'), pendingPage),
        range(base().not('approved_at', 'is', null).in('status', ['pending', 'processing', 'scheduled'])
            .order('scheduled_time').order('id'), approvedPage),
    ]);
    if (pending.error) throw pending.error;
    if (approved.error) throw approved.error;
    return {
        success: true,
        posts: pending.data || [],
        approvedPosts: approved.data || [],
        pendingCount: pending.count || 0,
        approvedCount: approved.count || 0,
        pendingPage, approvedPage, pageSize: PAGE_SIZE,
    };
};

// The scheduler is the only publishing path after approval. No external side
// effects may happen before this compare-and-set wins.
export const settlePendingPost = async (db, post, patch) => {
    const { data, error } = await db.from('scheduled_posts').update(patch)
        .eq('id', post.id).eq('workspace_id', post.workspace_id).eq('status', 'pending_approval')
        .select().maybeSingle();
    if (error) throw error;
    return data;
};
