// src/routers/waitlist.router.js

const express = require("express");
const router = express.Router();
const waitlistController = require("../controllers/waitlist.controller");

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


module.exports = router;
