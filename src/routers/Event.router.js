const express = require("express");
const router = express.Router();
const eventController = require("../controllers/event.controller");
const multer = require("multer");

// Configure Multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Define fields: 'image' (old) and 'proposal' (new)
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "proposal", maxCount: 1 },
]);

// ===============================
// EVENT CRUD
// ===============================

// GET all (approved) events
router.get("/", eventController.getAllEvents);

// Past Events + Feedback (Event History)
router.get("/history", eventController.getEventHistory);

// GET one event
router.get("/:id", eventController.getEventById);

// CREATE event (EXCO only) - UPDATED to handle files
router.post("/create", uploadFields, eventController.createEvent);

// UPDATE event
router.put("/:id", eventController.updateEvent);

// DELETE event
router.delete("/:id", eventController.deleteEvent);

// Upload event image (Standalone - Kept for compatibility)
router.post(
  "/upload-image",
  upload.single("image"),
  eventController.uploadEventImage,
);

// ===============================
// TEACHER APPROVAL ROUTES (NEW)
// ===============================
router.get("/teacher/pending", eventController.getPendingEvents);
router.post("/:eventId/review", eventController.reviewEvent);

// ===============================
// SIGN-UP SYSTEM (Original)
// ===============================
router.post("/signup", eventController.signupEvent);
router.post("/unsign", eventController.unsignEvent);

module.exports = router;
