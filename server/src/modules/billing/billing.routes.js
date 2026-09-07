import express from 'express';
import { protect } from '../../middleware/auth.js';
import { getPlans, getMe, subscribe, verify, cancel, webhook } from './billing.controller.js';

const router = express.Router();

// PUBLIC — the pricing page reads the catalog without a session.
router.get('/plans', getPlans);

// PUBLIC — Razorpay posts subscription events here (signature-verified).
router.post('/webhook', webhook);

// Authenticated billing actions.
router.get('/me', protect, getMe);
router.post('/subscribe', protect, subscribe);
router.post('/verify', protect, verify);
router.post('/cancel', protect, cancel);

export default router;
