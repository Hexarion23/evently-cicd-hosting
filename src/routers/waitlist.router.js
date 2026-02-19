// src/routers/waitlist.router.js

import express from 'express';
import * as waitlistController from '../controllers/waitlist.controller.js';

const router = express.Router();

// ===============================
// WAITLIST ROUTES
// ===============================

// Join waitlist
router.post("/join", waitlistController.joinWaitlist);

// Cancel waitlist entry
router.post("/cancel", waitlistController.cancelWaitlist);

// Accept promotion (user confirms)
router.post("/accept", waitlistController.acceptPromotion);

// Handle unsign-up (EXCO-controlled, or user removing signup)
router.post("/unsign", waitlistController.handleUnsignEvent);

// Get full waitlist for an event (EXCO only)
router.get("/:eventId", waitlistController.getWaitlist);

// ===============================
// ADMIN ACTIONS
// ===============================

// Manual promotion by EXCO
router.post("/promote-manual", waitlistController.manualPromote);

// Revoke an active promotion
router.post("/revoke", waitlistController.revokePromotion);

// Clear expired promotions
router.post("/clear-expired", waitlistController.clearExpiredPromotion);


export default router;
