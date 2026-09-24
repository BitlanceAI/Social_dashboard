import express from 'express';
import { protect } from '../../middleware/auth.js';
import { resolveWorkspace } from '../../middleware/workspace.js';
import { postMediaUpload } from '../../shared/storage/postMedia.js';
import {
    getConfig, getMe, createOrder, verifyPayment,
    listMedia, uploadMedia, deleteMedia, quickSchedule,
} from './storage.controller.js';

const router = express.Router();

router.use(protect, resolveWorkspace);

router.get('/config', getConfig);
router.get('/me', getMe);
router.post('/orders', createOrder);
router.post('/verify', verifyPayment);

// Media library — reusable files inside the purchased quota
router.get('/media', listMedia);
router.post('/media', postMediaUpload.array('files', 10), uploadMedia);
router.delete('/media/:id', deleteMedia);

// Quick-schedule a library file as a post (requires workspace context)
router.post('/quick-schedule', quickSchedule);

export default router;

