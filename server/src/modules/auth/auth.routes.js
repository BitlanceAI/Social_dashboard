import express from 'express';
import {
    login,
    signup,
    logout,
    getCurrentUser,
    refreshToken
} from './auth.controller.js';
import { authenticateUser } from '../../middleware/auth.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', login);
router.post('/signup', signup);
router.post('/refresh', refreshToken);

// Protected routes (authentication required)
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, getCurrentUser);

export default router;
