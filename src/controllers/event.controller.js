const eventModel = require("../models/event.model");
const notificationModel = require("../models/notification.model");
const { supabase } = require("../models/supabaseClient");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const QRCode = require("qrcode");

// Helper: Get user from token
function getUser(req) {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// ==========================================
// 1. GET ALL EVENTS (Public - Approved Only)
// ==========================================
exports.getAllEvents = async (req, res) => {
  try {
    const {
      search = "",
      sort = "date", // date | points
      visibility = "all", // all | poly-wide | cca-specific
      cca_id,
      hideExpired = "1", // 1 = hide signup-deadline passed
      hidePast = "1", // 1 = hide events already started
    } = req.query;

    const nowIso = new Date().toISOString();

    let q = supabase
      .from("event")
      .select("*, cca(name)")
      .eq("status", "approved");

    // Visibility filter
    if (visibility === "poly-wide") q = q.eq("visibility", "poly-wide");
    if (visibility === "cca-specific") q = q.eq("visibility", "cca-specific");

    // CCA filter
    if (cca_id) q = q.eq("cca_id", Number(cca_id));

    // Hide expired signups (deadline passed): keep null OR >= now
    if (hideExpired === "1") {
      q = q.or(`sign_up_deadline.is.null,sign_up_deadline.gte.${nowIso}`);
    }

    // Hide past events
    if (hidePast === "1") {
      q = q.gte("start_datetime", nowIso);
    }

    // Search (title/description/location)
    if (search.trim()) {
      const s = search.trim();
      q = q.or(
        `title.ilike.%${s}%,description.ilike.%${s}%,location.ilike.%${s}%`,
      );
    }

    // Sorting
    if (sort === "points") {
      q = q.order("cca_points", { ascending: false, nullsFirst: false });
      q = q.order("start_datetime", { ascending: true });
    } else {
      q = q.order("start_datetime", { ascending: true });
    }

    const { data, error } = await q;

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error("getAllEvents error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


// ==========================================
// 2. GET EVENT BY ID
// ==========================================
exports.getEventById = async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("event")
    .select("*, cca(name)")
    .eq("event_id", id)
    .single();

  if (error) return res.status(404).json({ error: "Event not found" });
  return res.json(data);
};

// ==========================================
// 3. CREATE EVENT (With Proposal & Image)
// ==========================================
exports.createEvent = async (req, res) => {
  try {
    const user = getUser(req);
    if (!user || user.role !== "exco") {
      return res.status(403).json({ error: "Only EXCO can submit events" });
    }

    const {
      title,
      description,
      start_datetime,
      end_datetime,
      location,
      cca_id,
      capacity,
      visibility,
      cca_points,
      sign_up_deadline,
      agenda,
      requirements,
      notes,
      safety_guidelines,
      contact_person,
      contact_email,
      contact_phone,
      cca_points_category,
    } = req.body;

    // 1. Handle Image (File Upload vs Preset String)
    let image_path = null;

    if (req.files && req.files["image"]) {
      // Logic A: User uploaded a custom file (Multer populates req.files)
      const file = req.files["image"][0];
      const filename = `events/${Date.now()}-${uuidv4().slice(0, 8)}.${file.originalname.split(".").pop()}`;

      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(filename, file.buffer, { contentType: file.mimetype });

      if (upErr) throw upErr;

      const { data } = supabase.storage
        .from("event-images")
        .getPublicUrl(filename);
      image_path = data.publicUrl;
    } else if (req.body.image && typeof req.body.image === "string") {
      // Logic B: User selected a PRESET image (Express populates req.body)
      image_path = req.body.image;
    }

    // 2. Handle Proposal Upload (if provided)
    let proposal_path = null;
    if (req.files && req.files["proposal"]) {
      const file = req.files["proposal"][0];
      const filename = `proposals/${Date.now()}-${uuidv4().slice(0, 8)}.${file.originalname.split(".").pop()}`;

      const { error: upErr } = await supabase.storage
        .from("event-proposals")
        .upload(filename, file.buffer, { contentType: file.mimetype });

      if (upErr) throw upErr;

      const { data } = supabase.storage
        .from("event-proposals")
        .getPublicUrl(filename);
      proposal_path = data.publicUrl;
    }

    // 3) create a unique QR string (human readable + random suffix)
    // Example: "QR-<CCAID>-<YYYYMMDD>-<short-uuid>"
    const dateSegment = new Date(start_datetime)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const qrToken = `QR-${req.body.cca_id}-${dateSegment}-${uuidv4().slice(
      0,
      8,
    )}`;

    // 4) create a PNG buffer for the QR
    const qrDataUrl = await QRCode.toDataURL(qrToken, {
      margin: 1,
      width: 600,
    });

    // qrDataUrl is data:image/png;base64,.... Convert to buffer:
    const base64 = qrDataUrl.split(",")[1];
    const pngBuffer = Buffer.from(base64, "base64");

    // 3) upload to Supabase Storage (bucket: event-qrcodes), put file path
    const filename = `qrcodes/${
      req.body.cca_id
    }/${Date.now()}-${uuidv4().slice(0, 8)}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("event-qrcodes")
      .upload(filename, pngBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("QR upload error:", uploadError);
      // continue but still pass qrToken (you may choose to fail)
      return res.status(500).json({ error: "Failed to upload QR image" });
    }

    // Make it public or create public URL
    const { data: publicUrlData } = supabase.storage
      .from("event-qrcodes")
      .getPublicUrl(filename);
    const qrImageUrl = publicUrlData.publicUrl;

    // 3. Insert Event (Status: pending)
    const { data, error } = await supabase
      .from("event")
      .insert([
        {
          title,
          description,
          start_datetime,
          end_datetime,
          location,
          cca_id,
          qr_code: qrToken,
          qr_image_path: qrImageUrl,
          capacity: parseInt(capacity),
          image_path,
          proposal_path,
          visibility: visibility || "cca-specific",
          cca_points: parseInt(cca_points || 0),
          cca_points_category,
          sign_up_deadline: sign_up_deadline || null,
          created_by: user.id,
          status: "pending", // <--- Default status
          registered_count: 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // 4. Insert Extra Details (Optional)
    const detailsPayload = {
      event_id: data.event_id,
      agenda,
      requirements,
      notes,
      safety_guidelines,
      contact_person,
      contact_email,
      contact_phone,
    };
    // Remove undefined/null keys
    Object.keys(detailsPayload).forEach(
      (key) => detailsPayload[key] === undefined && delete detailsPayload[key],
    );

    if (Object.keys(detailsPayload).length > 1) {
      await supabase.from("event_details").insert([detailsPayload]);
    }

    // 5. Notify Teachers
    await notifyTeachersOfSubmission(cca_id, title);

    return res.status(201).json(data);
  } catch (err) {
    console.error("Create event error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 4. TEACHER FEATURES (NEW)
// ==========================================

// Get events waiting for approval
exports.getPendingEvents = async (req, res) => {
  try {
    const user = getUser(req);
    // In a real app check: if (user.role !== 'teacher') ...
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // Find CCAs this teacher manages
    const { data: memberships } = await supabase
      .from("cca_membership")
      .select("cca_id")
      .eq("user_id", user.id)
      .eq("role", "teacher");

    const myCcaIds = memberships ? memberships.map((m) => m.cca_id) : [];
    if (myCcaIds.length === 0) return res.json([]);

    // Fetch pending events
    const { data: events, error } = await supabase
      .from("event")
      .select(`*, cca (name), User:created_by (name, email)`)
      .in("cca_id", myCcaIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(events || []);
  } catch (err) {
    console.error("Get pending error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// Approve or Reject event
exports.reviewEvent = async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });

    const { eventId } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await supabase
      .from("event")
      .update({ status: status })
      .eq("event_id", eventId)
      .select()
      .single();

    if (error) throw error;

    // Notify EXCO
    const msg =
      status === "approved"
        ? `Your event "${data.title}" has been APPROVED and is now live!`
        : `Your event "${data.title}" was REJECTED. Please check with your teacher.`;

    await notificationModel.createNotification(data.created_by, msg);

    return res.json({ message: `Event ${status}`, event: data });
  } catch (err) {
    console.error("Review error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 5. OTHER ORIGINAL METHODS (Kept as is)
// ==========================================

exports.uploadEventImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const file = req.file;
    const ext = (file.originalname.split(".") || []).pop();
    const filename = `events/${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("event-images")
      .upload(filename, file.buffer, { contentType: file.mimetype });
    if (error) return res.status(500).json({ error: "Failed to upload image" });
    const { data } = await supabase.storage
      .from("event-images")
      .getPublicUrl(filename);
    return res.json({ publicUrl: data.publicUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.signupEvent = async (req, res) => {
  try {
    const { event_id, user_id } = req.body;
    if (!event_id || !user_id)
      return res.status(400).json({ error: "Missing fields" });

    // Check capacity
    const { data: event } = await supabase
      .from("event")
      .select("capacity, registered_count")
      .eq("event_id", event_id)
      .single();
    if (event.registered_count >= event.capacity)
      return res.status(400).json({ error: "Event full" });

    const { error } = await supabase
      .from("event_signup")
      .insert([{ event_id, user_id, signed_up_at: new Date() }]);
    if (error) throw error;

    // Increment count
    await supabase.rpc("increment_registered_count", {
      event_id_input: event_id,
    });
    return res.json({ message: "Signed up" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

exports.unsignEvent = async (req, res) => {
  try {
    const { event_id, user_id } = req.body;
    const { error } = await supabase
      .from("event_signup")
      .delete()
      .eq("event_id", event_id)
      .eq("user_id", user_id);
    if (error) throw error;
    await supabase.rpc("decrement_registered_count", {
      event_id_input: event_id,
    });
    return res.json({ message: "Unsigned" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

exports.deleteEvent = async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("event").delete().eq("event_id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: "Deleted" });
};

exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Split "event" fields vs "event_details" fields
    const {
      agenda,
      requirements,
      notes,
      safety_guidelines,
      contact_person,
      contact_email,
      contact_phone,
      ...raw
    } = req.body || {};

    // 2) Whitelist ONLY real columns in `event` table
    const allowedEventCols = [
      "title",
      "description",
      "start_datetime",
      "end_datetime",
      "location",
      "capacity",
      "visibility",
      "cca_points",
      "cca_points_category",
      "sign_up_deadline",
      "image_path",
      "proposal_path",
      "status",
    ];

    const eventUpdates = {};
    for (const k of allowedEventCols) {
      if (raw[k] !== undefined) eventUpdates[k] = raw[k];
    }

    // 3) Update event table
    if (Object.keys(eventUpdates).length > 0) {
      const { error: evErr } = await supabase
        .from("event")
        .update(eventUpdates)
        .eq("event_id", id);

      if (evErr) return res.status(500).json({ error: evErr.message });
    }

    // 4) Upsert event_details (only if any details provided)
    const details = {
      agenda,
      requirements,
      notes,
      safety_guidelines,
      contact_person,
      contact_email,
      contact_phone,
    };

    Object.keys(details).forEach(
      (k) => details[k] === undefined && delete details[k],
    );

    if (Object.keys(details).length > 0) {
      const { data: existing, error: exErr } = await supabase
        .from("event_details")
        .select("detail_id")
        .eq("event_id", id)
        .maybeSingle();

      if (exErr) return res.status(500).json({ error: exErr.message });

      if (existing) {
        const { error: detErr } = await supabase
          .from("event_details")
          .update(details)
          .eq("event_id", id);

        if (detErr) return res.status(500).json({ error: detErr.message });
      } else {
        const { error: detErr } = await supabase
          .from("event_details")
          .insert([{ event_id: Number(id), ...details }]);

        if (detErr) return res.status(500).json({ error: detErr.message });
      }
    }

    return res.json({ message: "Updated" });
  } catch (e) {
    console.error("updateEvent error:", e);
    return res.status(500).json({ error: e.message });
  }
};


// --- Helper: Notify Teachers ---
async function notifyTeachersOfSubmission(ccaId, eventTitle) {
  const { data: teachers } = await supabase
    .from("cca_membership")
    .select("user_id")
    .eq("cca_id", ccaId)
    .eq("role", "teacher");

  if (teachers && teachers.length > 0) {
    const promises = teachers.map((t) =>
      notificationModel.createNotification(
        t.user_id,
        `New Proposal: "${eventTitle}" is waiting for approval.`,
      ),
    );
    await Promise.all(promises);
  }
}

exports.getEventFeedbackAnalysis = async (req, res) => {
  const { eventId } = req.params;

  try {
    // We run both queries in parallel for better performance
    const [comments, stats] = await Promise.all([
      eventModel.getFeedbackByEvent(eventId),
      eventModel.getFeedbackStats(eventId),
    ]);

    if (!stats) {
      return res.status(200).json({
        success: true,
        message: "No feedback found for this event.",
        data: {
          stats: { average: 0, totalResponses: 0, distribution: {} },
          comments: [],
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        stats,
        comments,
      },
    });
  } catch (error) {
    console.error("Error fetching feedback analysis:", error.message);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

exports.getEventHistory = async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // 1) Get past events the user signed up for
    const { data: events, error: eventsError } = await supabase
      .from("event")
      .select(`
        event_id,
        title,
        description,
        start_datetime,
        end_datetime,
        location,
        cca_points,
        event_signup!inner(user_id)
      `)
      .eq("event_signup.user_id", user.id)
      .order("end_datetime", { ascending: false });

    if (eventsError) {
      console.error("Error loading past events:", eventsError);
      return res.status(500).json({ error: eventsError.message });
    }

    if (!events || events.length === 0) {
      return res.json({ data: [] });
    }

    const eventIds = events.map((e) => e.event_id);

    // 2) Get this user's attendance status for these events
    const { data: signups, error: signupsError } = await supabase
      .from("event_signup")
      .select("event_id, attendance_status")
      .eq("user_id", user.id)
      .in("event_id", eventIds);

    if (signupsError) {
      console.error("Error loading signups:", signupsError);
      return res.status(500).json({ error: signupsError.message });
    }

    const signupsMap = {};
    (signups || []).forEach((row) => {
      signupsMap[row.event_id] = row;
    });

    // 3) Get feedback for these events
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from("event_feedback")
      .select("feedback_id,event_id,user_id,rating,comment,created_at")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    if (feedbackError) {
      console.error("Error loading feedback:", feedbackError);
      return res.status(500).json({ error: feedbackError.message });
    }

    // 4) Get author names
    let userMap = {};
    if (feedbackRows && feedbackRows.length > 0) {
      const userIds = Array.from(new Set(feedbackRows.map((r) => r.user_id)));

      const { data: users, error: usersError } = await supabase
        .from("User")
        .select("user_id,name")
        .in("user_id", userIds);

      if (usersError) {
        console.error("Error fetching feedback user names:", usersError);
      } else {
        (users || []).forEach((u) => (userMap[u.user_id] = u));
      }
    }

    // 5) Group feedback by event
    const feedbackMap = {};
    (feedbackRows || []).forEach((row) => {
      if (!feedbackMap[row.event_id]) feedbackMap[row.event_id] = [];
      feedbackMap[row.event_id].push({
        feedback_id: row.feedback_id,
        event_id: row.event_id,
        user_id: row.user_id,
        rating: row.rating,
        comment: row.comment || "",
        created_at: row.created_at,
        userName: userMap[row.user_id]?.name || "Student",
        isMine: row.user_id === user.id,
      });
    });

    // 6) Normalize final payload (same as your frontend state)
    const out = events.map((ev) => {
      const feedbackList = feedbackMap[ev.event_id] || [];
      const userFeedback = feedbackList.find((f) => f.isMine) || null;

      const attendance = signupsMap[ev.event_id]?.attendance_status || null;
      const canReview = String(attendance || "").toLowerCase() === "present";


      return {
        id: ev.event_id,
        title: ev.title,
        description: ev.description || "",
        start_datetime: ev.start_datetime,
        end_datetime: ev.end_datetime,
        location: ev.location || "",
        cca_points: ev.cca_points,
        attendance_status: attendance,
        canReview,
        feedbackList,
        userFeedback,
      };
    });

    return res.json({ data: out });
  } catch (err) {
    console.error("getEventHistory error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

