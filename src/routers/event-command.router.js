// src/routers/event-command.router.js
import express from "express";
import PDFDocument from "pdfkit";
import { supabase } from "../models/supabaseClient.js";
import { getEventFeedbackAnalysis } from "../controllers/event.controller.js";
import nodemailer from "nodemailer";

const router = express.Router(); // <--- ADDED for RPA

// ───────────────────────────────────────────────
// RPA SETUP: Configure the Email Robot
// ───────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Status sort priority
const getStatusPriority = (status) => {
  const order = {
    present: 1,
    checked_in: 2,
    absent: 3,
    registered: 4,
    waitlisted: 5,
  };
  return order[status] ?? 99;
};

// ───────────────────────────────────────────────
// GET /api/command/:event_id/participants
// ───────────────────────────────────────────────
router.get("/:event_id/participants", async (req, res) => {
  const { event_id: rawEventId } = req.params;
  const eventId = parseInt(rawEventId, 10);

  if (isNaN(eventId)) {
    console.warn(`Invalid event_id: "${rawEventId}"`);
    return res.status(400).json({ error: "Invalid event ID" });
  }

  console.log(
    `[GET /participants] START - event_id = ${eventId} (raw: "${rawEventId}")`,
  );

  try {
    // 1. Fetch event
    const { data: event, error: eventErr } = await supabase
      .from("event")
      .select(
        `
        event_id,
        title,
        start_datetime,
        location,
        cca_id,
        cca!event_cca_id_fkey ( name )
      `,
      )
      .eq("event_id", eventId)
      .single();

    if (eventErr || !event) {
      console.log(
        `Event ${eventId} not found - error: ${eventErr?.message || "no data"}`,
      );
      return res.status(404).json({ error: "Event not found" });
    }

    console.log(`Event loaded: "${event.title}" (cca_id: ${event.cca_id})`);

    // 2. Fetch signups WITH USER DATA
    const { data: signupsWithUsers, error: signupErr } = await supabase
      .from("event_signup")
      .select(
        `
        signup_id,
        user_id,
        signed_up_at,
        attendance_status,
        attendance_scanned_at,
        User!event_signup_user_id_fkey (
          user_id,
          name,
          email,
          admin_number
        )
      `,
      )
      .eq("event_id", eventId);

    if (signupErr) {
      console.error("Signups fetch error:", signupErr.message);
      return await fallbackParticipants(event, eventId, res);
    }

    // Process the joined data
    const participants = signupsWithUsers.map((s) => {
      const user = s.User || {};
      return {
        signup_id: s.signup_id,
        user_id: s.user_id,
        name: user.name || "Unknown",
        email: user.email || null,
        admin_number: user.admin_number || null,
        signed_up: s.signed_up_at,
        status: s.attendance_status || "registered",
        attended: ["present", "checked_in"].includes(s.attendance_status),
        role: "member", // Will be updated
        scanned_at: s.attendance_scanned_at,
      };
    });

    // Fetch roles
    const userIds = [
      ...new Set(participants.map((p) => p.user_id).filter(Boolean)),
    ];
    let rolesMap = new Map();

    if (userIds.length > 0 && event.cca_id) {
      const { data: members, error: memberErr } = await supabase
        .from("cca_membership")
        .select("user_id, role")
        .eq("cca_id", event.cca_id)
        .in("user_id", userIds);

      if (!memberErr && members) {
        rolesMap = new Map(members.map((m) => [m.user_id, m.role]));
      }
    }

    participants.forEach((p) => {
      p.role = rolesMap.get(p.user_id) || "member";
    });

    participants.sort((a, b) => {
      const pa = getStatusPriority(a.status);
      const pb = getStatusPriority(b.status);
      if (pa !== pb) return pa - pb;
      return new Date(b.signed_up || 0) - new Date(a.signed_up || 0);
    });

    const total_signups = participants.length;
    const attended_count = participants.filter((p) => p.attended).length;

    res.json({
      participants,
      statistics: { total_signups, attended_count },
      event: {
        title: event.title,
        date: event.start_datetime,
        location: event.location || "Not specified",
        cca_name: event.cca?.name || "—",
      },
    });
  } catch (err) {
    console.error("[/participants] CRITICAL ERROR:", err.message);
    res.status(500).json({
      error: "Internal server error while fetching participants",
      message: err.message,
    });
  }
});

// Fallback function if join fails
async function fallbackParticipants(event, eventId, res) {
  try {
    const { data: signupsRaw, error: signupsOnlyErr } = await supabase
      .from("event_signup")
      .select(
        `
        signup_id,
        user_id,
        signed_up_at,
        attendance_status,
        attendance_scanned_at
      `,
      )
      .eq("event_id", eventId);

    if (signupsOnlyErr) throw signupsOnlyErr;

    const participants = signupsRaw.map((s) => ({
      signup_id: s.signup_id,
      user_id: s.user_id,
      name: `User ${s.user_id}`,
      email: `user${s.user_id}@example.com`,
      admin_number: `P${s.user_id}`.padStart(8, "0"),
      signed_up: s.signed_up_at,
      status: s.attendance_status || "registered",
      attended: ["present", "checked_in"].includes(s.attendance_status),
      role: "member",
      scanned_at: s.attendance_scanned_at,
    }));

    participants.sort((a, b) => {
      const pa = getStatusPriority(a.status);
      const pb = getStatusPriority(b.status);
      if (pa !== pb) return pa - pb;
      return new Date(b.signed_up || 0) - new Date(a.signed_up || 0);
    });

    const total_signups = participants.length;
    const attended_count = participants.filter((p) => p.attended).length;

    res.json({
      participants,
      statistics: { total_signups, attended_count },
      event: {
        title: event.title,
        date: event.start_datetime,
        location: event.location || "Not specified",
        cca_name: event.cca?.name || "—",
      },
      note: "Using fallback data (user table inaccessible)",
    });
  } catch (err) {
    console.error("Fallback also failed:", err.message);
    throw err;
  }
}

// ───────────────────────────────────────────────
// GET /api/command/:event_id/export-pdf
// ───────────────────────────────────────────────
router.get("/:event_id/export-pdf", async (req, res) => {
  const { event_id: rawEventId } = req.params;
  const eventId = parseInt(rawEventId, 10);

  if (isNaN(eventId))
    return res.status(400).json({ error: "Invalid event ID" });

  try {
    const { data: event, error: eventErr } = await supabase
      .from("event")
      .select(
        `event_id, title, start_datetime, location, cca_id, cca!event_cca_id_fkey(name)`,
      )
      .eq("event_id", eventId)
      .single();

    if (eventErr || !event)
      return res.status(404).json({ error: "Event not found" });

    const { data: signupsData } = await supabase
      .from("event_signup")
      .select(
        `
        signup_id, user_id, signed_up_at, attendance_status, attendance_scanned_at,
        User!event_signup_user_id_fkey ( user_id, name, email, admin_number )
      `,
      )
      .eq("event_id", eventId)
      .order("attendance_status", { ascending: true })
      .order("signed_up_at", { ascending: true });

    const participants = (signupsData || []).map((s) => {
      const user = s.User || {};
      return {
        name: user.name || `User ${s.user_id}`,
        email: user.email || "N/A",
        admin_number: user.admin_number || "N/A",
        status: s.attendance_status || "registered",
        attended: ["present", "checked_in"].includes(s.attendance_status),
      };
    });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const safeTitle = event.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
    const filename = `SP_Evently_${safeTitle}_${new Date().toISOString().split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    // PDF Content
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#d8292f")
      .text("SINGAPORE POLYTECHNIC", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Evently - Attendance Report", { align: "center" });

    doc
      .moveTo(50, doc.y + 10)
      .lineTo(550, doc.y + 10)
      .lineWidth(2)
      .strokeColor("#d8292f")
      .stroke();
    doc.moveDown(2);

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("EVENT DETAILS", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Event Title: ${event.title}`);
    doc.text(
      `Event Date: ${new Date(event.start_datetime).toLocaleDateString("en-SG")}`,
    );
    doc.moveDown(1.5);

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("ATTENDANCE LIST", { underline: true });
    doc.moveDown(1);

    // Table
    let yPos = doc.y;
    participants.forEach((p, i) => {
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`${i + 1}. ${p.name} - ${p.status.toUpperCase()}`, 50, yPos);
      yPos += 15;
    });

    doc.end();
  } catch (err) {
    console.error("PDF export error:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// ───────────────────────────────────────────────
// POST /api/command/:event_id/send-email (RPA LOGIC)
// ───────────────────────────────────────────────
router.post("/:event_id/send-email", async (req, res) => {
  const { event_id } = req.params;
  const { participants = [], subject = "", template = "" } = req.body;

  if (!participants || participants.length === 0) {
    return res.status(400).json({ error: "No participants provided for RPA." });
  }

  console.log(`[RPA] Starting batch email for ${participants.length} users...`);

  // STRICTER EMAIL REGEX
  // Must have: chars @ chars . chars (at least 2)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  try {
    // 1. Define RPA Tasks
    const emailTasks = participants.map(async (person) => {
      // Validate Email Format
      if (!person.email || !emailRegex.test(person.email)) {
        throw new Error(`Invalid email format: ${person.email}`);
      }

      const mailOptions = {
        from: `"Evently Command Center" <${process.env.EMAIL_USER}>`,
        to: person.email,
        subject: subject,
        text: template.replace(/\[Name\]/g, person.name),
        html: `<div style="font-family: Arial, sans-serif; color: #333;">
                <p style="white-space: pre-wrap;">${template.replace(/\[Name\]/g, person.name)}</p>
                <br>
                <hr>
                <p style="font-size: 12px; color: #666;">
                  Sent via Evently Command Center for Event ID: ${event_id}
                </p>
               </div>`,
      };

      // Send via Nodemailer (Promise resolves if SMTP Server accepts the message)
      await transporter.sendMail(mailOptions);
      return person.email;
    });

    // 2. Execute Tasks
    const results = await Promise.allSettled(emailTasks);

    // 3. Analyze Results
    const successList = [];
    const failureList = [];

    results.forEach((result, index) => {
      const person = participants[index];
      if (result.status === "fulfilled") {
        successList.push(person.email);
      } else {
        failureList.push({
          name: person.name,
          email: person.email,
          reason: result.reason.message || "SMTP Error",
        });
        console.error(`[RPA Fail] ${person.email}:`, result.reason);
      }
    });

    // 4. Return Report
    res.json({
      success: true,
      total: participants.length,
      sent_count: successList.length,
      failed_count: failureList.length,
      failures: failureList,
    });
  } catch (err) {
    console.error("[RPA Critical Error]", err);
    res
      .status(500)
      .json({ error: "Critical server error during email dispatch." });
  }
});

router.get("/analysis/:eventId", getEventFeedbackAnalysis);

export default router;
