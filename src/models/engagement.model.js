// src/models/engagement.model.js
const { supabase } = require("./supabaseClient");

// Small helper for IN filters
function inFilter(q, col, ids) {
  const list = `(${ids.join(",")})`;
  return q.filter(col, "in", list);
}

// ---------- CORE STATS FOR ONE USER ----------

// All event_signup rows for this user
async function getUserSignups(userId) {
  const { data, error } = await supabase
    .from("event_signup")
    .select("event_id, signed_up_at, attendance_status, attendance_scanned_at")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

// All CCA memberships (any role) for this user
async function getUserCcaMemberships(userId) {
  const { data, error } = await supabase
    .from("cca_membership")
    .select("cca_id, role")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

// Build a small stats object + engagement score
async function getUserEngagementStats(userId) {
  const signups = await getUserSignups(userId);

  const totalSignups = signups.length;

  let attendedCount = 0;
  let upcomingCount = 0;
  const now = new Date();

  signups.forEach((s) => {
    // Check if attended
    if (s.attendance_status === "present" || s.attendance_scanned_at) {
      attendedCount++;
    } else {
      // If not attended, check if it is in the future?
      // We'd need event date for that.
      // For simplified scoring:
      // "Upcoming" ~= signed up but not yet attended/absent mark
      // Actually simpler: just count total vs attended
    }
  });

  // Unique events?
  const distinctEventCount = new Set(signups.map((s) => s.event_id)).size;

  // Simple Score Formula
  // 10 pts per signup
  // 20 pts per attendance
  const score = totalSignups * 10 + attendedCount * 20;

  // Level logic
  let level = "New Explorer";
  if (score > 50) level = "Active Participant";
  if (score > 200) level = "Event Enthusiast";
  if (score > 500) level = "Campus Star";

  return {
    score,
    level,
    totalSignups,
    attendedCount,
    distinctEventCount,
  };
}

// ---------- RECOMMENDATIONS ----------

/**
 * Recommend events based on:
 * 1. User's CCA memberships (events from same CCA)
 * 2. Poly-wide events
 * 3. Exclude events user already signed up for
 * 4. Exclude events created by user (if EXCO)
 * 5. ONLY SHOW APPROVED EVENTS
 */
async function getRecommendedEventsForUser(userId, limit = 5) {
  // 1) Get user's CCA IDs
  const memberships = await getUserCcaMemberships(userId);
  const ccaIds = memberships.map((m) => m.cca_id);

  // 2) Get events user already signed up for (to exclude)
  const signups = await getUserSignups(userId);
  const signupEventIds = new Set(signups.map((s) => s.event_id));

  // 3) Query Events
  const nowIso = new Date().toISOString();

  let q = supabase
    .from("event")
    .select(
      `
      event_id,
      title,
      start_datetime,
      description,
      location,
      visibility,
      cca_id,
      cca(name),
      image_path,
      capacity,
      created_by,
      sign_up_deadline,
      status
      `,
    )
    .eq("status", "approved") // <--- FIX: Only recommend APPROVED events
    .gte("start_datetime", nowIso)
    // Signup must still be open (or no deadline)
    .or(`sign_up_deadline.is.null,sign_up_deadline.gte.${nowIso}`)
    // Exclude events created by this user (EXCO / organiser)
    .neq("created_by", userId);

  // Visibility rules
  const orFilters = ["visibility.eq.poly-wide"];
  if (ccaIds.length > 0) {
    orFilters.push(`cca_id.in.(${ccaIds.join(",")})`);
  }

  q = q.or(orFilters.join(",")).order("start_datetime", { ascending: true });

  const { data: events, error } = await q;
  if (error) throw error;

  if (!events || !events.length) return [];

  // 4) Remove events user already signed up or waitlisted for
  const filtered = events.filter((e) => !signupEventIds.has(e.event_id));

  // 5) Rank events
  // Priority: Same CCA > Poly-wide
  const weights = {};
  filtered.forEach((e) => {
    let w = 0;
    if (e.visibility === "poly-wide") w += 1;
    if (ccaIds.includes(e.cca_id)) w += 5; // Higher weight for own CCA
    weights[e.event_id] = w;
  });

  filtered.sort((a, b) => weights[b.event_id] - weights[a.event_id]);

  return filtered.slice(0, limit);
}

module.exports = {
  getUserEngagementStats,
  getRecommendedEventsForUser,
};
