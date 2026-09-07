import express from 'express';
import { protect } from '../../middleware/auth.js';
import { getCalendar, getBetween } from './occasions.controller.js';

const router = express.Router();

// Read-only occasion calendar for any signed-in user (content planner, UI).
// Admin add/edit lives under /api/admin/occasions (admin.routes.js).
router.use(protect);

router.get('/calendar', getCalendar);
router.get('/between', getBetween);

export default router;
