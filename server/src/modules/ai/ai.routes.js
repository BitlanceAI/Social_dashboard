import express from 'express';
import { protect } from '../../middleware/auth.js';
import { generateCaption, status } from './ai.controller.js';

const router = express.Router();

router.use(protect);

router.get('/status', status);
router.post('/caption', generateCaption);

export default router;
