// ============================================================
// WAITLIST CONTROLLER — FINAL FULLY FIXED VERSION
// (Matches frontend event-details.js EXACTLY)
// ============================================================

const waitlistModel = require("../models/waitlist.model");
const { supabase } = require("../models/supabaseClient");
const jwt = require("jsonwebtoken");

const PROMOTION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const JWT_SECRET = process.env.JWT_SECRET;

// ------------------------------------------------------------
// Extract logged-in user_id from JWT cookie
// ------------------------------------------------------------
async function getUserIdFromToken(req) {
  const token = req.cookies?.token;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.id;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Count current event signups
// ------------------------------------------------------------
async function getRegisteredCount(eventId) {
  const { count, error } = await supabase
    .from("event_signup")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) return 0;
  return count || 0;
}

// ------------------------------------------------------------
// Internal — send promotion notification
// ------------------------------------------------------------
async function createPromotionNotification(userId, eventId) {
  try {
    const { data: event, error } = await supabase
      .from("event")
      .select("title")
      .eq("event_id", eventId)
      .single();

    if (error || !event) return;

    const message = `A spot is available for "${event.title}". You have 2 hours to accept the promotion.`;

    await supabase.from("notification").insert([
      {
        user_id: userId,
        message,
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    console.error("Notification error:", err);
  }
}

// ------------------------------------------------------------
// Internal — offer next promotion
// ------------------------------------------------------------
async function offerNextPromotion(eventId) {
  console.log(`➡️ offerNextPromotion() for event ${eventId}`);

  // 1. Remove expired promotions
  await waitlistModel.clearExpiredPromotionsForEvent(eventId);

  // 2. Load capacity
  const { data: event } = await supabase
    .from("event")
    .select("capacity")
    .eq("event_id", eventId)
    .single();

  if (!event) return;

  const capacity = event.capacity;

  // 3. Count current signups
  const registeredCount = await getRegisteredCount(eventId);

  // 4. Only promote if a spot has opened AND there are waitlist users
  if (capacity === null || capacity === undefined) {
    console.log("⚠️ Event has no capacity — cannot promote.");
    return;
  }

  if (registeredCount >= capacity) {
    console.log("🔴 No free slots, cannot promote.");
    return;
  }

  console.log("🟢 A free slot is available — promoting next user!");

  // 5. Next waitlist user
  const candidate = await waitlistModel.getNextUnofferedCandidate(eventId);
  if (!candidate) {
    console.log("ℹ️ Waitlist empty — nothing to promote.");
    return;
  }

  // 6. Offer promotion
  const expiresAt = new Date(Date.now() + PROMOTION_TIMEOUT_MS).toISOString();
  await waitlistModel.markPromotionOffered(candidate.waitlist_id, expiresAt);

  // 7. Notification
  await createPromotionNotification(candidate.user_id, eventId);

  console.log(`🎉 PROMOTION SENT → user=${candidate.user_id}, waitlist_id=${candidate.waitlist_id}`);
}


// ============================================================
// JOIN WAITLIST or DIRECT SIGNUP (smart logic)
// ============================================================
exports.joinWaitlist = async (req, res) => {
  try {
    const eventId = req.body.eventId || req.body.event_id;
    const userId = await getUserIdFromToken(req);

    if (!eventId || !userId)
      return res.status(400).json({ error: "Invalid request" });

    // =========================
    // Load FULL event info
    // =========================
    const { data: event, error: eventError } = await supabase
      .from("event")
      .select("event_id, capacity, sign_up_deadline, cca_id, created_by")
      .eq("event_id", eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // =========================
    // ❌ Block organiser
    // =========================
    if (event.created_by === userId) {
      return res.status(403).json({
        error: "Organisers cannot join the waitlist for their own event",
      });
    }

    // =========================
    // ❌ Block EXCO of same CCA
    // =========================
    if (event.cca_id) {
      const { data: membership } = await supabase
        .from("cca_membership")
        .select("role")
        .eq("user_id", userId)
        .eq("cca_id", event.cca_id)
        .maybeSingle();

      if (membership?.role?.toLowerCase().includes("exco")) {
        return res.status(403).json({
          error:
            "EXCO members cannot join the waitlist for their own CCA's event",
        });
      }
    }

    // =========================
    // ❌ Block expired signup
    // =========================
    if (event.sign_up_deadline) {
      const now = new Date();
      const ddl = new Date(event.sign_up_deadline);

      if (now > ddl) {
        return res.status(403).json({
          error: "Sign-up deadline has passed for this event",
        });
      }
    }

    // =========================
    // Existing capacity logic
    // =========================
    const registeredCount = await getRegisteredCount(eventId);

    const eventFull =
  event.capacity !== null &&
  event.capacity !== undefined &&
  registeredCount >= event.capacity;


    if (!eventFull) {
      return res.status(400).json({
        error: "Event still has available slots. You can sign up directly.",
      });
    }

    // =========================
    // Prevent duplicate waitlist
    // =========================
    const { data: existing } = await supabase
      .from("event_waitlist")
      .select("waitlist_id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: "You are already on the waitlist for this event",
      });
    }

    // =========================
    // Insert waitlist entry
    // =========================
    const { error: insertError } = await supabase
      .from("event_waitlist")
      .insert({
        event_id: eventId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        promotion_offered: false,
      });

    if (insertError) {
      console.error("Waitlist insert error:", insertError);
      return res.status(500).json({
        error: "Failed to join waitlist",
      });
    }

    return res.json({
      message: "Successfully added to waitlist",
    });
  } catch (err) {
    console.error("joinWaitlist error:", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};


    
// ============================================================
// CANCEL WAITLIST ENTRY
// ============================================================
// ============================================================
// CANCEL WAITLIST ENTRY
// - Student: removes self
// - EXCO/Admin: can remove a specific user_id for an event
// ============================================================
exports.cancelWaitlist = async (req, res) => {
  try {
    const eventId = req.body.eventId || req.body.event_id;
    const requesterId = await getUserIdFromToken(req);

    if (!eventId || !requesterId) {
      return res.status(400).json({ error: "Invalid request" });
    }

    // If admin is removing someone, frontend will send user_id
    const targetUserId = req.body.user_id ? parseInt(req.body.user_id, 10) : null;

    // Load requester role from backend auth payload if you have it,
    // or infer via DB lookup (safer)
    // Load event CCA
const { data: event } = await supabase
  .from("event")
  .select("cca_id")
  .eq("event_id", eventId)
  .single();

let isExco = false;

if (event?.cca_id) {
  const { data: membership } = await supabase
    .from("cca_membership")
    .select("role")
    .eq("user_id", requesterId)
    .eq("cca_id", event.cca_id)
    .maybeSingle();

  isExco = membership?.role?.toLowerCase().includes("exco");
}


    // Default behaviour: user cancels their own waitlist entry
    let finalTargetUserId = requesterId;

    // EXCO can cancel for others ONLY if user_id was provided
    if (isExco && targetUserId) {
      finalTargetUserId = targetUserId;
    }

    await waitlistModel.removeUserFromWaitlist(eventId, finalTargetUserId);

    // Optional: if EXCO removed someone and a slot exists, promote next
    await offerNextPromotion(eventId);

    return res.json({
      message: isExco && targetUserId
        ? "User removed from waitlist"
        : "Removed from waitlist",
    });
  } catch (err) {
    console.error("cancelWaitlist error:", err);
    return res.status(500).json({ error: "Failed to cancel waitlist entry" });
  }
};


// ============================================================
// ACCEPT PROMOTION (user confirms spot)
// ============================================================
exports.acceptPromotion = async (req, res) => {
  try {
    const eventId = req.body.eventId || req.body.event_id;
    const userId = await getUserIdFromToken(req);

    if (!eventId || !userId)
      return res.status(400).json({ error: "Invalid request" });

    // Check active promotion
    const promo = await waitlistModel.getActivePromotionForUser(eventId, userId);
    if (!promo)
      return res.status(400).json({ error: "Promotion expired or invalid" });

    // 1. Mark accepted
    await waitlistModel.markPromotionAccepted(promo.waitlist_id);

    // 2. Add user to event signup
    const { error } = await supabase.from("event_signup").insert([
      { event_id: eventId, user_id: userId, attendance_status: "absent" }
    ]);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to confirm sign-up" });
    }

    // 3. Remove from waitlist
    await waitlistModel.removeWaitlistEntry(promo.waitlist_id);

    return res.json({ message: "Promotion accepted — signed up!" });

  } catch (err) {
    console.error("acceptPromotion error:", err);
    return res.status(500).json({ error: "Failed to accept promotion" });
  }
};

// ============================================================
// UNSIGN USER FROM EVENT → promote next candidate
// ============================================================
exports.handleUnsignEvent = async (req, res) => {
  try {
    const eventId = req.body.eventId || req.body.event_id;
    const userId = await getUserIdFromToken(req);

    if (!eventId || !userId)
      return res.status(400).json({ error: "Invalid request" });

    await supabase
      .from("event_signup")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);

    // Try promoting next person
    await offerNextPromotion(eventId);

    return res.json({
      message: "Un-signed successfully. Next user promoted if applicable."
    });

  } catch (err) {
    console.error("handleUnsignEvent error:", err);
    return res.status(500).json({ error: "Failed to unsign" });
  }
};

// ============================================================
// GET FULL WAITLIST FOR EVENT
// ============================================================
exports.getWaitlist = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const list = await waitlistModel.getWaitlistWithUserInfo(eventId);
    return res.json({ event_id: eventId, waitlist: list });

  } catch (err) {
    console.error("getWaitlist error:", err);
    return res.status(500).json({ error: "Failed to load waitlist" });
  }
};

// ============================================================
// MANUAL PROMOTION (EXCO)
// ============================================================
exports.manualPromote = async (req, res) => {
  try {
    const waitlistId = req.body.waitlistId;
    const entry = await waitlistModel.getWaitlistEntryById(waitlistId);

    if (!entry)
      return res.status(404).json({ error: "Waitlist entry not found" });

    const expiresAt = new Date(Date.now() + PROMOTION_TIMEOUT_MS).toISOString();

    await waitlistModel.markPromotionOffered(waitlistId, expiresAt);

    await createPromotionNotification(entry.user_id, entry.event_id);

    return res.json({ message: "Manual promotion sent." });

  } catch (err) {
    console.error("manualPromote error:", err);
    return res.status(500).json({ error: "Failed manual promote" });
  }
};

// ============================================================
// REVOKE PROMOTION (EXCO)
// ============================================================
exports.revokePromotion = async (req, res) => {
  try {
    const waitlistId = req.body.waitlistId;
    const entry = await waitlistModel.getWaitlistEntryById(waitlistId);

    if (!entry)
      return res.status(404).json({ error: "Waitlist entry not found" });

    await waitlistModel.clearPromotion(waitlistId);

    return res.json({ message: "Promotion revoked." });

  } catch (err) {
    console.error("revokePromotion error:", err);
    return res.status(500).json({ error: "Failed to revoke promotion" });
  }
};

// ============================================================
// CLEAR EXPIRED PROMOTION + promote next
// ============================================================
exports.clearExpiredPromotion = async (req, res) => {
  try {
    const waitlistId = req.body.waitlistId;
    const eventId = req.body.eventId;

    await waitlistModel.removeWaitlistEntry(waitlistId);

    await offerNextPromotion(eventId);

    return res.json({
      message: "Expired promotion cleared. Next candidate promoted."
    });

  } catch (err) {
    console.error("clearExpiredPromotion error:", err);
    return res.status(500).json({ error: "Failed to clear expired promotion" });
  }
};

// ============================================================
// INTERNAL — USED BY CRON TO PROMOTE NEXT USER
// ============================================================
exports._cronAutoPromote = async (eventId) => {
  await offerNextPromotion(eventId);
};
