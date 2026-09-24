/**
 * Workspace resolution.
 *
 * `authenticateUser` parses the raw `x-workspace-id` header into
 * `req.workspaceId`. This middleware is what makes it trustworthy: it verifies
 * the caller is actually a member, and replaces the raw header value with the
 * resolved id so no downstream query ever filters on unvalidated input.
 *
 * When the header is absent it falls back to the caller's default workspace.
 * That fallback is what lets the server and client deploy independently — a
 * client that knows nothing about workspaces keeps working unchanged.
 *
 * Mount it per-module, below each module's auth guard, never globally: the
 * OAuth callbacks are unauthenticated, and /api/auth and /api/profiles are
 * deliberately per-user.
 */

import '../config/env.js';

import { supabaseAdmin } from '../config/supabase.js';

const CLIENT_MODULES = new Set(['/api/content', '/api/reports', '/api/brand', '/api/push', '/api/briefs', '/api/campaigns', '/api/pillars']);

const finishWorkspaceResolution = (req, res, next, membership) => {
    req.workspace = { id: membership.workspace_id, role: membership.role };
    req.workspaceId = membership.workspace_id;
    if (membership.role === 'client' && !CLIENT_MODULES.has(req.baseUrl)) {
        return res.status(403).json({
            success: false,
            error: 'This area is not available to client portal users',
            code: 'CLIENT_PORTAL_ONLY',
        });
    }
    return next();
};

export const resolveWorkspace = async (req, res, next) => {
    try {
        if (!supabaseAdmin) {
            console.error('[Workspace] SUPABASE_SERVICE_ROLE_KEY missing — cannot resolve workspaces.');
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        const requested = req.workspaceId;

        if (requested) {
            const { data: membership, error } = await supabaseAdmin
                .from('workspace_members')
                .select('workspace_id, role')
                .eq('workspace_id', requested)
                .eq('user_id', req.user.id)
                .maybeSingle();

            if (error) throw error;

            if (!membership) {
                return res.status(403).json({
                    success: false,
                    error: 'You are not a member of that workspace',
                    code: 'WORKSPACE_FORBIDDEN',
                });
            }

            return finishWorkspaceResolution(req, res, next, membership);
        }

        // No header: resolve (and create on first use) the default workspace.
        // Shared with the signup trigger so the two cannot diverge.
        const { data: workspaceId, error: rpcError } = await supabaseAdmin
            .rpc('ensure_default_workspace', { p_user: req.user.id });

        if (rpcError) throw rpcError;

        if (!workspaceId) {
            return res.status(500).json({
                success: false,
                error: 'Could not resolve a workspace for this account',
            });
        }

        // Resolve the real role. The workspace may be an invited client's
        // default, so assuming owner here would be a privilege escalation.
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('workspace_members')
            .select('workspace_id, role')
            .eq('workspace_id', workspaceId)
            .eq('user_id', req.user.id)
            .single();
        if (membershipError) throw membershipError;
        return finishWorkspaceResolution(req, res, next, membership);
    } catch (error) {
        console.error('[Workspace] Resolution failed:', error);
        return res.status(500).json({ success: false, error: 'Workspace resolution failed' });
    }
};

/**
 * Gate a route on the caller's role in the resolved workspace.
 * Must run after resolveWorkspace.
 *
 * Roles are ordered: owner > admin > member.
 */
export const requireWorkspaceRole = (...roles) => (req, res, next) => {
    if (!req.workspace) {
        return res.status(500).json({ success: false, error: 'Workspace not resolved' });
    }

    if (!roles.includes(req.workspace.role)) {
        return res.status(403).json({
            success: false,
            error: `This action requires the ${roles.join(' or ')} role`,
            code: 'INSUFFICIENT_ROLE',
        });
    }

    return next();
};

const ROLE_CAPABILITIES = Object.freeze({
    owner: ['*'],
    admin: ['content.*', 'reports.view', 'brand.manage', 'connections.manage', 'members.manage'],
    member: ['content.view', 'content.create', 'content.edit', 'content.submit', 'content.comment', 'content.publish', 'reports.view'],
    client: ['content.view', 'content.comment', 'content.approve', 'reports.view'],
});

const matchesCapability = (granted, requested) => granted === '*'
    || granted === requested
    || (granted.endsWith('.*') && requested.startsWith(granted.slice(0, -1)));

export const hasWorkspaceCapability = (role, capability) =>
    (ROLE_CAPABILITIES[role] || []).some((granted) => matchesCapability(granted, capability));

export const requireWorkspaceCapability = (capability) => (req, res, next) => {
    if (!req.workspace) {
        return res.status(500).json({ success: false, error: 'Workspace not resolved' });
    }
    if (!hasWorkspaceCapability(req.workspace.role, capability)) {
        return res.status(403).json({
            success: false,
            error: 'You do not have permission to perform this workspace action',
            code: 'INSUFFICIENT_CAPABILITY',
        });
    }
    return next();
};

export default resolveWorkspace;
