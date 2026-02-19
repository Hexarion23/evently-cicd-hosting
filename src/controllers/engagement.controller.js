// src/controllers/engagement.controller.js
const jwt = require("jsonwebtoken");
const engagementModel = require("../models/engagement.model");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function getUserFromCookie(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET); // { id, admin_number, role }
  } catch {
    return null;
  }
}

// GET /api/engagement/me
exports.getMyEngagement = async (req, res) => {
  try {
    const user = getUserFromCookie(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const stats = await engagementModel.getUserEngagementStats(user.id);

    return res.json({
      user_id: user.id,
      score: stats.score,
      level: stats.level,
      totalSignups: stats.totalSignups,
      attendedCount: stats.attendedCount,
      upcomingCount: stats.upcomingCount,
      distinctEventCount: stats.distinctEventCount,
    });
  } catch (err) {
    console.error("getMyEngagement error:", err);
    return res
      .status(500)
      .json({ error: "Server error calculating engagement" });
  }
};

// GET /api/engagement/recommendations?limit=5
exports.getMyRecommendations = async (req, res) => {
  try {
    const user = getUserFromCookie(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const limit = Number(req.query.limit || 5);
    const events = await engagementModel.getRecommendedEventsForUser(
      user.id,
      limit
    );

    return res.json({
      user_id: user.id,
      count: events.length,
      events,
    });
  } catch (err) {
    console.error("getMyRecommendations error:", err);
    return res
      .status(500)
      .json({ error: "Server error computing recommendations" });
  }
};
