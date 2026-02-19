// src/routes/engagement.router.js
const express = require("express");
const router = express.Router();
const engagementController = require("../controllers/engagement.controller");

// Current user’s engagement score + stats
router.get("/me", engagementController.getMyEngagement);

// Recommended upcoming events for current user
router.get("/recommendations", engagementController.getMyRecommendations);

module.exports = router;
