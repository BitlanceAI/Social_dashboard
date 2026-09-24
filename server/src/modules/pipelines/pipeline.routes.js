import express from 'express';
import { protect } from '../../middleware/auth.js';
import { resolveWorkspace, requireWorkspaceCapability } from '../../middleware/workspace.js';
import * as controller from './pipeline.controller.js';

const router = express.Router();

router.use(protect, resolveWorkspace);

router.get('/', requireWorkspaceCapability('content.view'), controller.listPipelines);
router.post('/', requireWorkspaceCapability('content.create'), controller.createPipeline);
router.get('/:id', requireWorkspaceCapability('content.view'), controller.getPipeline);
router.put('/:id', requireWorkspaceCapability('content.edit'), controller.updatePipeline);
router.delete('/:id', requireWorkspaceCapability('content.edit'), controller.deletePipeline);
router.post('/:id/run', requireWorkspaceCapability('content.publish'), controller.runPipelineNow);
router.get('/:id/queue', requireWorkspaceCapability('content.view'), controller.getQueue);
router.post('/:id/sync-sheet', requireWorkspaceCapability('content.edit'), controller.syncSheetQueue);
router.post('/:id/import', requireWorkspaceCapability('content.edit'), controller.importQueue);
router.delete('/:id/queue', requireWorkspaceCapability('content.edit'), controller.clearQueue);

export default router;
