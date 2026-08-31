/**
 * Workspace routes.
 *
 * Every route is authenticated but NOT workspace-resolved: these take the
 * workspace in the path, because you must be able to act on a workspace you
 * have not switched into — and `GET /` has to work before any workspace is
 * selected at all. Role checks live in the controller, next to the invariants
 * they protect (last owner, orphaned defaults).
 */

// Process-wide env bootstrap — these module-scope reads need it loaded.
import '../../config/env.js';

import express from 'express';

import { authenticateUser } from '../../middleware/auth.js';
import {
    listWorkspaces,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    listMembers,
    updateMemberRole,
    removeMember,
    leaveWorkspace,
    createInvite,
    listInvites,
    revokeInvite,
    previewInvite,
    acceptInvite,
} from './workspace.controller.js';

const router = express.Router();

router.use(authenticateUser);

// Invite token routes come first: '/invites/:token' must not be captured by
// '/:id' as a workspace id.
router.get('/invites/:token', previewInvite);
router.post('/invites/:token/accept', acceptInvite);

router.get('/', listWorkspaces);
router.post('/', createWorkspace);
router.patch('/:id', renameWorkspace);
router.delete('/:id', deleteWorkspace);

router.get('/:id/members', listMembers);
router.patch('/:id/members/:userId', updateMemberRole);
router.delete('/:id/members/:userId', removeMember);
router.post('/:id/leave', leaveWorkspace);

router.get('/:id/invites', listInvites);
router.post('/:id/invites', createInvite);
router.delete('/:id/invites/:inviteId', revokeInvite);

export default router;
