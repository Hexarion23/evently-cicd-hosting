import { supabase } from "../models/supabaseClient.js";
import jwt from "jsonwebtoken";

const { JWT_SECRET } = process.env;

async function scanAttendance(req, res) {
  try {
    // If frontend sends user token, use it to identify user.
    // Accept either the scanner's cookie token OR include scanned_user_id in body.
    const token = req.cookies?.token;
    let scanned_user_id = req.body.scanned_user_id || null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        scanned_user_id = decoded.id;
      } catch (e) {
        // token invalid - but we may still accept scanned_user_id provided explicitly
      }
    }

    if (!scanned_user_id) {
      return res.status(401).json({
        error: "Scanner must provide a valid token or scanned_user_id",
      });
    }

    const { qr_code, event_id } = req.body;
    if (!qr_code) return res.status(400).json({ error: "Missing qr_code" });

    // Fetch event by QR code
    const { data: eventRows, error: eventError } = await supabase
      .from("event")
      .select("*")
      .eq("qr_code", qr_code)
      .limit(1);

    if (eventError) {
      console.error("Event fetch error:", eventError);
      return res.status(500).json({ error: "DB error fetching event" });
    }

    const eventRow = eventRows && eventRows.length > 0 ? eventRows[0] : null;

    // Check if event exists
    if (!eventRow) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check event time window
    const now = new Date();
    const start = new Date(eventRow.start_datetime);
    const end = new Date(eventRow.end_datetime);

    // Allow marking 1 hour before event start
    if (now < new Date(start.getTime() - 1000 * 60 * 60)) {
      return res.status(400).json({ error: "Event has not started yet" });
    }

    // Allow marking up to 6 hours after event end
    if (now > new Date(end.getTime() + 1000 * 60 * 60 * 6)) {
      return res.status(400).json({ error: "Event attendance window closed" });
    }

    // Check if user is signed up for the event
    const { data: signupRows, error: signupError } = await supabase
      .from("event_signup")
      .select("*")
      .eq("event_id", eventRow.event_id)
      .eq("user_id", scanned_user_id)
      .limit(1);

    if (signupError) {
      console.error("Signup check error:", signupError);
      return res.status(500).json({ error: "DB error checking signup" });
    }

    if (!signupRows || signupRows.length === 0) {
      return res
        .status(403)
        .json({ error: "User is not signed up for this event" });
    }

    // Check if attendance already marked (idempotent)
    const { data: existing, error: existingError } = await supabase
      .from("event_signup")
      .select("*")
      .eq("event_id", eventRow.event_id)
      .eq("user_id", scanned_user_id)
      .eq("attendance_status", "present")
      .limit(1);

    if (existingError) {
      console.error("Attendance check error:", existingError);
      return res.status(500).json({ error: "DB error checking attendance" });
    }

    if (existing && existing.length > 0) {
      return res.json({
        ok: true,
        message: "Already marked",
        attendance: existing[0],
      });
    }

    // Insert new attendance record
    const { data: inserted, error: insertErr } = await supabase
      .from("event_signup")
      .update({
        attendance_status: "present",
        attendance_scanned_at: new Date().toISOString(),
      })
      .eq("event_id", eventRow.event_id) 
      .eq("user_id", scanned_user_id) 
      .select()
      .single();

    if (insertErr) {
      console.error("Attendance insert error:", insertErr);
      return res.status(500).json({ error: "Failed to mark attendance" });
    }

    return res.json({
      ok: true,
      message: "Attendance marked",
      attendance: inserted,
      event_id: eventRow.event_id,
      event_title: eventRow.title,
    });
  } catch (err) {
    console.error("scanAttendance error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export { scanAttendance };
