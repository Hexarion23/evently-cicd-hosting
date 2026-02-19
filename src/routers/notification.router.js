const express = require("express");
const jwt = require("jsonwebtoken");
const { supabase } = require("../models/supabaseClient");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================================================
// GET UNREAD NOTIFICATIONS FOR CURRENT USER
// =========================================================
router.get("/unread", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id;

    const { data, error } = await supabase
      .from("notification")
      .select("*")
      .eq("user_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching unread notifications:", error);
      return res.status(500).json({ error: "Server error fetching notifications" });
    }

    return res.json(data || []);
  } catch (err) {
    console.error("Error in /unread:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// GET ALL NOTIFICATIONS FOR CURRENT USER (PAGINATED)
// =========================================================
router.get("/", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { data, error } = await supabase
      .from("notification")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching notifications:", error);
      return res.status(500).json({ error: "Server error fetching notifications" });
    }

    return res.json({
      data: data || [],
      count: data?.length || 0,
      offset,
      limit,
    });
  } catch (err) {
    console.error("Error in GET /:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// GET UNREAD COUNT FOR CURRENT USER
// =========================================================
router.get("/count/unread", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id;

    const { count, error } = await supabase
      .from("notification")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error getting unread count:", error);
      return res.status(500).json({ error: "Server error" });
    }

    return res.json({ count: count || 0 });
  } catch (err) {
    console.error("Error in /count/unread:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// MARK NOTIFICATION AS READ
// =========================================================
router.put("/:notificationId/read", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id;
    const notificationId = parseInt(req.params.notificationId, 10);

    // Verify ownership
    const { data: notification, error: fetchError } = await supabase
      .from("notification")
      .select("user_id")
      .eq("notification_id", notificationId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (notification.user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to update this notification" });
    }

    // Mark as read
    const { data, error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("notification_id", notificationId)
      .select()
      .single();

    if (error) {
      console.error("Error marking notification as read:", error);
      return res.status(500).json({ error: "Server error" });
    }

    return res.json({ message: "Notification marked as read", data });
  } catch (err) {
    console.error("Error in PUT /:notificationId/read:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// =========================================================
// MARK ALL NOTIFICATIONS AS READ FOR CURRENT USER
// =========================================================
router.put("/mark-all-read", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const userId = decoded.id;

    const { error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking all notifications as read:", error);
      return res.status(500).json({ error: "Server error" });
    }

    return res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("Error in PUT /mark-all-read:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
