import '../../config/env.js';

import express from 'express';
import { authenticateUser } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceCapability } from '../../middleware/workspace.js';
import * as controller from './content.controller.js';

const router = express.Router();
router.use(authenticateUser, resolveWorkspace);

router.get('/', requireWorkspaceCapability('content.view'), controller.list);
router.post('/', requireWorkspaceCapability('content.create'), controller.create);
router.get('/:id', requireWorkspaceCapability('content.view'), controller.getOne);
router.post('/:id/versions', requireWorkspaceCapability('content.edit'), controller.version);
router.post('/:id/comments', requireWorkspaceCapability('content.comment'), controller.comment);
router.post('/:id/submit-internal', requireWorkspaceCapability('content.submit'), controller.transition('submit_internal'));
router.post('/:id/submit-client', requireWorkspaceCapability('content.submit'), controller.transition('submit_client'));
router.post('/:id/request-changes', requireWorkspaceCapability('content.approve'), controller.transition('request_changes'));
router.post('/:id/approve', requireWorkspaceCapability('content.approve'), controller.transition('approve'));
router.post('/:id/cancel', requireWorkspaceCapability('content.edit'), controller.transition('cancel'));
router.post('/:id/schedule', requireWorkspaceCapability('content.publish'), controller.schedule);

export default router;

