/**
 * Workspace membership, roles and invites.
 *
 * These endpoints take the workspace in the URL rather than the
 * x-workspace-id header, because you must be able to administer a workspace you
 * have not switched into — listing members of one, or accepting an invite to
 * one you are not yet in. Header scoping remains the rule for everything that
 * publishes.
 */

import '../../config/env.js';

import crypto from 'crypto';
import { supabaseAdmin as supabase } from '../../config/supabase.js';
import { purgeWorkspaceMedia } from '../storage/storage.service.js';

const ROLES = ['owner', 'admin', 'member'];

/** The caller's role in a workspace, or null when they are not a member. */
const roleOf = async (workspaceId, userId) => {
    const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
    return data?.role ?? null;
};

const requireRole = async (req, res, workspaceId, allowed) => {
    const role = await roleOf(workspaceId, req.user.id);

    if (!role) {
        res.status(404).json({ error: 'Workspace not found' });
        return null;
    }
    if (!allowed.includes(role)) {
        res.status(403).json({
            error: `This action requires the ${allowed.join(' or ')} role`,
            code: 'INSUFFICIENT_ROLE',
        });
        return null;
    }
    return role;
};

const countOwners = async (workspaceId) => {
    const { count } = await supabase
        .from('workspace_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner');
    return count ?? 0;
};

// ==================== WORKSPACES ====================

export const listWorkspaces = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('workspace_members')
            .select('role, workspaces ( id, name, owner_id, created_at )')
            .eq('user_id', req.user.id);

        if (error) throw error;

        const workspaces = (data || [])
            .filter((row) => row.workspaces)
            .map((row) => ({ ...row.workspaces, role: row.role }));

        // First call for a brand-new account: mint the default rather than
        // returning an empty list the client would have to special-case.
        if (workspaces.length === 0) {
            const { data: id, error: rpcError } = await supabase
                .rpc('ensure_default_workspace', { p_user: req.user.id });
            if (rpcError) throw rpcError;

            const { data: created } = await supabase
                .from('workspaces')
                .select('id, name, owner_id, created_at')
                .eq('id', id)
                .single();

            if (created) workspaces.push({ ...created, role: 'owner' });
        }

        const { data: profile } = await supabase
            .from('users')
            .select('default_workspace_id')
            .eq('id', req.user.id)
            .maybeSingle();

        res.json({
            success: true,
            workspaces,
            defaultWorkspaceId: profile?.default_workspace_id ?? workspaces[0]?.id ?? null,
        });
    } catch (error) {
        console.error('List workspaces error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createWorkspace = async (req, res) => {
    try {
        const name = (req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'A workspace name is required' });

        // An RPC because supabase-js has no transactions, and a workspaces row
        // without its owner membership row is permanently unreachable — no RLS
        // predicate could ever be satisfied for it. p_user is required here:
        // this is the service-role client, so auth.uid() is NULL in the RPC.
        const { data: id, error } = await supabase.rpc('create_workspace', {
            p_name: name,
            p_user: req.user.id,
        });
        if (error) throw error;

        const { data: workspace } = await supabase
            .from('workspaces')
            .select('id, name, owner_id, created_at')
            .eq('id', id)
            .single();

        res.status(201).json({ success: true, workspace: { ...workspace, role: 'owner' } });
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const renameWorkspace = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await requireRole(req, res, id, ['owner', 'admin'])) return;

        const name = (req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'A workspace name is required' });

        const { error } = await supabase
            .from('workspaces')
            .update({ name, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, name });
    } catch (error) {
        console.error('Rename workspace error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteWorkspace = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await requireRole(req, res, id, ['owner'])) return;

        // Everyone whose default this was would otherwise get a fresh empty
        // workspace minted on their next request, silently.
        const { data: orphaned } = await supabase
            .from('users')
            .select('id')
            .eq('default_workspace_id', id);

        // Physical media objects first: the workspaces delete cascades the
        // media_library ROWS, but a cascade cannot reach the files in
        // Bunny/Supabase — skipping this leaks paid storage silently.
        await purgeWorkspaceMedia(id);

        // The row delete cascades the rest: meta/linkedin connections
        // (disconnecting them), scheduled posts, members, and invites.
        const { error } = await supabase.from('workspaces').delete().eq('id', id);
        if (error) throw error;

        for (const user of orphaned || []) {
            await supabase.rpc('ensure_default_workspace', { p_user: user.id });
        }

        res.json({ success: true, message: 'Workspace deleted' });
    } catch (error) {
        console.error('Delete workspace error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== MEMBERS ====================

export const listMembers = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await requireRole(req, res, id, ROLES)) return;

        const { data, error } = await supabase
            .from('workspace_members')
            .select('user_id, role, created_at, users ( email, name )')
            .eq('workspace_id', id);

        if (error) throw error;

        res.json({
            success: true,
            members: (data || []).map((m) => ({
                userId: m.user_id,
                role: m.role,
                joinedAt: m.created_at,
                email: m.users?.email ?? null,
                name: m.users?.name ?? null,
            })),
        });
    } catch (error) {
        console.error('List members error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateMemberRole = async (req, res) => {
    try {
        const { id, userId } = req.params;
        if (!await requireRole(req, res, id, ['owner'])) return;

        const { role } = req.body || {};
        if (!ROLES.includes(role)) {
            return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
        }

        const current = await roleOf(id, userId);
        if (!current) return res.status(404).json({ error: 'That person is not a member' });

        // A workspace with no owner can never be administered again.
        if (current === 'owner' && role !== 'owner' && await countOwners(id) <= 1) {
            return res.status(400).json({ error: 'A workspace must keep at least one owner' });
        }

        const { error } = await supabase
            .from('workspace_members')
            .update({ role })
            .eq('workspace_id', id)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, role });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const removeMember = async (req, res) => {
    try {
        const { id, userId } = req.params;
        if (!await requireRole(req, res, id, ['owner', 'admin'])) return;

        const target = await roleOf(id, userId);
        if (!target) return res.status(404).json({ error: 'That person is not a member' });

        if (target === 'owner' && await countOwners(id) <= 1) {
            return res.status(400).json({ error: 'A workspace must keep at least one owner' });
        }

        const { error } = await supabase
            .from('workspace_members')
            .delete()
            .eq('workspace_id', id)
            .eq('user_id', userId);

        if (error) throw error;

        // They may have been sitting in this workspace as their default.
        await supabase.rpc('ensure_default_workspace', { p_user: userId }).catch(() => {});

        res.json({ success: true, message: 'Member removed' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const leaveWorkspace = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await requireRole(req, res, id, ROLES);
        if (!role) return;

        if (role === 'owner' && await countOwners(id) <= 1) {
            return res.status(403).json({
                error: 'You are the only owner. Transfer ownership or delete the workspace instead.',
            });
        }

        const { error } = await supabase
            .from('workspace_members')
            .delete()
            .eq('workspace_id', id)
            .eq('user_id', req.user.id);

        if (error) throw error;

        await supabase.rpc('ensure_default_workspace', { p_user: req.user.id }).catch(() => {});

        res.json({ success: true, message: 'You left the workspace' });
    } catch (error) {
        console.error('Leave workspace error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ==================== INVITES ====================

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const createInvite = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await requireRole(req, res, id, ['owner', 'admin'])) return;

        const email = (req.body?.email || '').trim().toLowerCase();
        const role = req.body?.role === 'admin' ? 'admin' : 'member';

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'A valid email is required' });
        }

        const token = crypto.randomBytes(32).toString('base64url');

        // Only the hash is stored, so a database leak cannot be used to join.
        const { data, error } = await supabase
            .from('workspace_invites')
            .insert({
                workspace_id: id,
                email,
                role,
                token_hash: hashToken(token),
                invited_by: req.user.id,
            })
            .select('id, email, role, expires_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'There is already an open invite for that email' });
            }
            throw error;
        }

        // There is no mailer in this project, so the caller gets the link to
        // send themselves. Wire this to an email provider when one exists.
        const acceptUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${token}`;

        res.status(201).json({ success: true, invite: data, acceptUrl, delivery: 'manual' });
    } catch (error) {
        console.error('Create invite error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const listInvites = async (req, res) => {
    try {
        const { id } = req.params;
        if (!await requireRole(req, res, id, ['owner', 'admin'])) return;

        const { data, error } = await supabase
            .from('workspace_invites')
            .select('id, email, role, expires_at, accepted_at, created_at')
            .eq('workspace_id', id)
            .is('accepted_at', null);

        if (error) throw error;
        res.json({ success: true, invites: data || [] });
    } catch (error) {
        console.error('List invites error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const revokeInvite = async (req, res) => {
    try {
        const { id, inviteId } = req.params;
        if (!await requireRole(req, res, id, ['owner', 'admin'])) return;

        const { error } = await supabase
            .from('workspace_invites')
            .delete()
            .eq('id', inviteId)
            .eq('workspace_id', id);

        if (error) throw error;
        res.json({ success: true, message: 'Invite revoked' });
    } catch (error) {
        console.error('Revoke invite error:', error);
        res.status(500).json({ error: error.message });
    }
};

/** Look up an invite by its raw token, so the client can show what it is. */
export const previewInvite = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('workspace_invites')
            .select('id, email, role, expires_at, accepted_at, workspaces ( id, name )')
            .eq('token_hash', hashToken(req.params.token))
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'That invite does not exist' });
        if (data.accepted_at) return res.status(410).json({ error: 'That invite has already been used' });
        if (new Date(data.expires_at) <= new Date()) {
            return res.status(410).json({ error: 'That invite has expired' });
        }

        res.json({
            success: true,
            invite: {
                email: data.email,
                role: data.role,
                workspaceName: data.workspaces?.name ?? null,
            },
        });
    } catch (error) {
        console.error('Preview invite error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const acceptInvite = async (req, res) => {
    try {
        const { data: invite, error } = await supabase
            .from('workspace_invites')
            .select('id, workspace_id, email, role, expires_at, accepted_at')
            .eq('token_hash', hashToken(req.params.token))
            .maybeSingle();

        if (error) throw error;
        if (!invite) return res.status(404).json({ error: 'That invite does not exist' });
        if (invite.accepted_at) return res.status(410).json({ error: 'That invite has already been used' });
        if (new Date(invite.expires_at) <= new Date()) {
            return res.status(410).json({ error: 'That invite has expired' });
        }

        // Bind the invite to the address it was sent to, or a leaked link would
        // let anyone join.
        const callerEmail = (req.user.email || '').toLowerCase();
        if (callerEmail !== invite.email.toLowerCase()) {
            return res.status(403).json({
                error: `This invite was sent to ${invite.email}. Sign in as that account to accept it.`,
            });
        }

        const { error: memberError } = await supabase
            .from('workspace_members')
            .upsert(
                { workspace_id: invite.workspace_id, user_id: req.user.id, role: invite.role },
                { onConflict: 'workspace_id,user_id' },
            );

        if (memberError) throw memberError;

        await supabase
            .from('workspace_invites')
            .update({ accepted_at: new Date().toISOString(), accepted_by: req.user.id })
            .eq('id', invite.id);

        res.json({ success: true, workspaceId: invite.workspace_id, role: invite.role });
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(500).json({ error: error.message });
    }
};
