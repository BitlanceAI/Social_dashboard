import express from 'express';
import { protect } from '../../middleware/auth.js';
import { requireAdmin } from './admin.middleware.js';
import {
    getOverview, getUsers, createUser, getConnections,
    getStorageSettings, updateStorageSettings, getStoragePurchases,
} from './admin.controller.js';

const router = express.Router();

// Every admin route needs a valid session AND the 'admin' role.
router.use(protect, requireAdmin);

router.get('/overview', getOverview);
router.get('/users', getUsers);
router.post('/users', createUser);
router.get('/connections', getConnections);
router.get('/storage/settings', getStorageSettings);
router.put('/storage/settings', updateStorageSettings);
router.get('/storage/purchases', getStoragePurchases);

export default router;
