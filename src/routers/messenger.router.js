import express from "express";
import * as messenger from "../controllers/messenger.controller.js";
import requireNotSuspended from "../middleware/requireNotSuspended.js";

const router = express.Router();

// ==============================
// Conversations / Sidebar
// ==============================

// Sidebar list
router.get("/conversations", messenger.listConversations);

// Ensure / open CCA group chat
router.post("/cca/:cca_id/open", messenger.openCcaGroup);

// Create / open DM with policy checks
router.post("/dm/open", messenger.openDm);

// ==============================
// DM Request flow
// ==============================

router.post("/dm/request", messenger.createDmRequest);
router.get("/dm/requests/inbox", messenger.listDmRequestsInbox);
router.post("/dm/requests/:request_id/respond", messenger.respondDmRequest);

// ==============================
// Messages
// ==============================

// Get messages
router.get(
  "/conversations/:conversation_id/messages",
  messenger.getMessages
);

// 🚫 BLOCK SEND IF SUSPENDED (CRITICAL FIX)
router.post(
  "/conversations/:conversation_id/messages",
  requireNotSuspended,
  messenger.sendMessage
);

// Read tracking
router.post(
  "/conversations/:conversation_id/read",
  messenger.markRead
);

// Search in conversation
router.get(
  "/conversations/:conversation_id/search",
  messenger.searchMessages
);

// ==============================
// Moderation / Safety
// ==============================

// Soft delete message
router.post(
  "/messages/:message_id/delete",
  messenger.softDeleteMessage
);

// Pin / report
router.post(
  "/messages/:message_id/pin",
  messenger.pinMessage
);

router.post(
  "/messages/:message_id/report",
  messenger.reportMessage
);

// Get pinned message
router.get(
  "/conversations/:conversation_id/pin",
  messenger.getPinned
);

// Unpin
router.delete(
  "/conversations/:conversation_id/pin",
  messenger.unpinMessage
);

// ==============================
// Moderation inbox & actions
// ==============================

router.get(
  "/moderation/inbox",
  messenger.moderationInbox
);

router.post(
  "/moderation/cases/:case_id/action",
  messenger.moderationAction
);

// ==============================
// Suspension (NEW – frontend UX)
// ==============================

// Check my suspension status
router.get(
  "/suspension/me",
  messenger.getMySuspensionStatus
);

// ==============================
// User search (DM)
// ==============================

router.get(
  "/users/search",
  messenger.searchUsersForDm
);

export default router;
