import express from 'express';
import { getProfiles, createProfile, updateProfile, deleteProfile } from '../../controllers/auth/profileController.js';
import { supabase } from '../../config/supabaseClient.js';

const router = express.Router();

// Middleware to authenticate user using Supabase auth header
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // We already have user from Supabase client in most cases, but here we need to verify token
    // Using getUser instead of getSession for security on server
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }

    req.user = user;
    next();
};

router.use(authenticateUser);

router.get('/', getProfiles);
router.post('/', createProfile);
router.put('/:id', updateProfile);
router.delete('/:id', deleteProfile);

export default router;
