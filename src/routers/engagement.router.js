// src/routes/engagement.router.js
import express from 'express';
import * as engagementController from '../controllers/engagement.controller.js';

const router = express.Router();

// Current user’s engagement score + stats
router.get("/me", engagementController.getMyEngagement);

// Recommended upcoming events for current user
router.get("/recommendations", engagementController.getMyRecommendations);

export default router;
