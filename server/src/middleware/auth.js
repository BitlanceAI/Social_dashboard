import { ensureSubscription, billingOwner } from '../modules/billing/billing.service.js';
import { subscriptionAccess } from '../modules/billing/billing.policy.js';
import { supabaseAdmin } from '../config/supabase.js';
import { supabase } from '../config/supabase.js';

export const authenticateUser = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'Authorization header missing' });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, error: 'Token missing' });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        // Attach user and active workspace to request
        req.user = user;
        req.token = token;

        let rawWsId = req.headers['x-workspace-id'];
        if (rawWsId === 'null' || rawWsId === 'undefined' || !rawWsId) {
            rawWsId = null;
        }

        if (!rawWsId && user.id) {
            const { data } = await supabase
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();
            if (data?.workspace_id) {
                rawWsId = data.workspace_id;
            }
        }

        req.workspaceId = rawWsId || null;
        const exempt = ['/api/billing', '/api/admin', '/api/auth', '/api/profiles'];
        if (!exempt.some(path => req.baseUrl === path)) {
            if (rawWsId) {
                const { data: member, error: memberError } = await supabaseAdmin.from('workspace_members')
                    .select('user_id').eq('workspace_id', rawWsId).eq('user_id', user.id).maybeSingle();
                if (memberError) throw memberError;
                if (!member) return res.status(403).json({ error: 'Workspace access denied' });
            }
            const ownerId = await billingOwner(user.id, rawWsId);
            const sub = await ensureSubscription(ownerId);
            if (!subscriptionAccess(sub).active) {
                return res.status(402).json({ success: false, code: 'BILLING_INACTIVE', error: 'Complete payment setup or renew your plan in Billing to continue.' });
            }
        }
        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
};

// Alias for route compatibility
export const protect = authenticateUser;

