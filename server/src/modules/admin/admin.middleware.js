import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Gate behind `public.users.role = 'admin'`.
 *
 * The check uses the service-role client rather than the caller's token:
 * RLS lets a user read their own row, but the role decision should never
 * depend on client-reachable state. Runs after `protect`, so `req.user`
 * is a verified Supabase user.
 */
export const requireAdmin = async (req, res, next) => {
    try {
        if (!supabaseAdmin) {
            return res.status(503).json({ success: false, error: 'Admin API unavailable: service role key not configured' });
        }

        const { data, error } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', req.user.id)
            .single();

        if (error || data?.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        next();
    } catch (err) {
        console.error('[admin] role check failed:', err);
        res.status(500).json({ success: false, error: 'Role check failed' });
    }
};
