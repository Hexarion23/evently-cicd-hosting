import express from "express";
import createError from "http-errors";
import path from "path";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import authRouter from "./routers/auth.router.js";
import eventRouter from "./routers/Event.router.js";
import attendanceRouter from "./routers/attendance.router.js";
import notificationRouter from "./routers/notification.router.js";
import analyticsRouter from "./routers/analytics.router.js";
import waitlistRouter from "./routers/waitlist.router.js";
import engagementRouter from "./routers/engagement.router.js";
import chatRouter from "./routers/chatbot.router.js";
import messengerRouter from "./routers/messenger.router.js";
import eventCommandRouter from "./routers/event-command.router.js";
import proposalRouter from "./routers/proposal.router.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//prevent cron from running during Jest
if (process.env.NODE_ENV !== "test") {
  import("./cron/waitlist.cron.js");
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Routers
app.use("/api/auth", authRouter);
app.use("/api/events", eventRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/waitlist", waitlistRouter);
app.use("/api/engagement", engagementRouter);
app.use("/api/chat", chatRouter);
app.use("/api/messenger", messengerRouter);
app.use("/api/command", eventCommandRouter);
app.use("/api/proposals", proposalRouter);

// =================================================
// Root URL Redirect
// =================================================
app.get("/", (req, res) => {
  res.redirect("/html/index.html");
});

// =================================================
// ACCESS CONTROL MIDDLEWARE (The Gatekeeper)
// =================================================
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const accessControl = (req, res, next) => {
  const token = req.cookies?.token;
  const url = req.url;

  const publicPages = [
    "/html/index.html",
    "/html/login.html",
    "/html/register.html",
    "/html/register-teacher.html",
    "/html/legal.html",
    "/html/guide.html",
  ];

  if (publicPages.includes(url) || !url.endsWith(".html")) {
    return next();
  }

  if (!token) {
    return res.redirect("/html/login.html");
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);

    // --- TEACHER RESTRICTIONS ---
    if (user.role === "teacher") {
      const allowedForTeachers = [
        "teacher-dashboard.html",
        "messenger.html",
        "index.html",
        "legal.html",
        "guide.html",
      ];
      const isAllowed = allowedForTeachers.some((page) => url.includes(page));

      if (!isAllowed) {
        return res.redirect("/html/teacher-dashboard.html");
      }
      return next();
    }

    // --- STUDENT/EXCO RESTRICTIONS ---
    if (url.includes("teacher-dashboard.html") && user.role !== "teacher") {
      return res.redirect("/html/dashboard.html");
    }

    const excoOnly = [
      "analytics.html",
      "event-command-center.html",
      "waitlist-admin.html",
      "proposal-builder.html",
    ];
    if (excoOnly.some((page) => url.includes(page)) && user.role !== "exco") {
      return res.redirect("/html/dashboard.html");
    }

    next();
  } catch (err) {
    res.clearCookie("token");
    return res.redirect("/html/login.html");
  }
};

// APPLY GATEKEEPER BEFORE STATIC FILES
app.use(accessControl);

// Static files
app.use(express.static(path.join(__dirname, "public")));

// 404 Handler
app.use((req, res, next) => {
  next(createError(404, `Unknown resource ${req.method} ${req.originalUrl}`));
});

// Global error handler
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || "Unknown Server Error!",
  });
});

export default app;
