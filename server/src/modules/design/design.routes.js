import express from 'express';
import { protect } from '../../middleware/auth.js';
import { generateFromTemplate, listJobs, getJob } from './design.controller.js';
import savedDetailsRoutes from './savedDetails.routes.js';

const router = express.Router();

router.use(protect);
router.use('/saved-details', savedDetailsRoutes);

router.post('/generate-from-template', generateFromTemplate);
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);

export default router;
