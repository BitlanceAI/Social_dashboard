import express from 'express';
import { protect } from '../../middleware/auth.js';
import * as controller from './pipeline.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', controller.listPipelines);
router.post('/', controller.createPipeline);
router.get('/:id', controller.getPipeline);
router.put('/:id', controller.updatePipeline);
router.delete('/:id', controller.deletePipeline);
router.post('/:id/run', controller.runPipelineNow);
router.get('/:id/queue', controller.getQueue);
router.post('/:id/sync-sheet', controller.syncSheetQueue);
router.post('/:id/import', controller.importQueue);
router.delete('/:id/queue', controller.clearQueue);

export default router;

