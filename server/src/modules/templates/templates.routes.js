import express from 'express';
import { protect } from '../../middleware/auth.js';
import { requireAdmin } from '../admin/admin.middleware.js';
import { list, niches, getOne, adminList, adminCreate, adminUpdate, adminDelete } from './templates.controller.js';

const router = express.Router();

// Public gallery (active templates are public-readable).
router.get('/', list);
router.get('/niches', niches);

// Admin catalog management (role='admin'). Mounted BEFORE the :key route so
// "/admin" is not captured as a template key.
router.get('/admin', protect, requireAdmin, adminList);
router.post('/admin', protect, requireAdmin, adminCreate);
router.put('/admin/:key', protect, requireAdmin, adminUpdate);
router.delete('/admin/:key', protect, requireAdmin, adminDelete);

router.get('/:key', getOne);

export default router;
