import express from 'express';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { protect } from '../../middleware/auth.js';
import { generateCaption, status } from './ai.controller.js';

const router = express.Router();

router.use(protect, resolveWorkspace);

router.get('/status', status);
router.post('/caption', generateCaption);

export default router;
