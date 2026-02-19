/* ============================================================ 
   WAITLIST MODEL — FINAL CLEAN VERSION (Option A logic)
============================================================ */

import { supabase } from "./supabaseClient.js";

/* ------------------------------------------------------------
   ADD USER TO WAITLIST
------------------------------------------------------------ */
async function addUserToWaitlist(eventId, userId) {
  const { data: existing, error: existingError } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw new Error("Failed to check existing waitlist entry");
  if (existing) return existing;

  const { data, error } = await supabase
    .from("event_waitlist")
    .insert([{ event_id: eventId, user_id: userId }])
    .select()
    .single();

  if (error) throw new Error("Failed to add user to waitlist");
  return data;
}

/* ------------------------------------------------------------
   GET SINGLE WAITLIST ENTRY BY EVENT + USER
------------------------------------------------------------ */
async function getWaitlistEntry(eventId, userId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch waitlist entry");
  return data;
}

/* ------------------------------------------------------------
   GET FULL WAITLIST FOR EVENT
------------------------------------------------------------ */
async function getWaitlistForEvent(eventId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: true });

  if (error) throw new Error("Failed to fetch waitlist");
  return data || [];
}

/* ------------------------------------------------------------
   REMOVE WAITLIST ENTRY BY EVENT + USER
------------------------------------------------------------ */
async function removeUserFromWaitlist(eventId, userId) {
  const { error } = await supabase
    .from("event_waitlist")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) throw new Error("Failed to remove waitlist entry");
  return true;
}

/* ------------------------------------------------------------
   REMOVE WAITLIST ENTRY BY waitlist_id
------------------------------------------------------------ */
async function removeWaitlistEntry(waitlistId) {
  const { error } = await supabase
    .from("event_waitlist")
    .delete()
    .eq("waitlist_id", waitlistId);

  if (error) throw new Error("Failed to remove waitlist entry");
  return true;
}

/* ------------------------------------------------------------
   DELETE (alias)
------------------------------------------------------------ */
async function deleteWaitlistById(waitlistId) {
  return removeWaitlistEntry(waitlistId);
}

/* ------------------------------------------------------------
   GET WAITLIST ENTRY BY ID
------------------------------------------------------------ */
async function getWaitlistEntryById(waitlistId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("waitlist_id", waitlistId)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch waitlist entry by ID");
  return data;
}

/* ------------------------------------------------------------
   GET NEXT CANDIDATE (PROMOTION NOT YET OFFERED)
------------------------------------------------------------ */
async function getNextUnofferedCandidate(eventId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .eq("promotion_offered", false)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch next candidate");
  return data;
}

/* ------------------------------------------------------------
   MARK PROMOTION OFFERED
------------------------------------------------------------ */
async function markPromotionOffered(waitlistId, expiresAt) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .update({
      promotion_offered: true,
      promotion_expires_at: expiresAt,
      promoted_at: null
    })
    .eq("waitlist_id", waitlistId)
    .select()
    .single();

  if (error) throw new Error("Failed to mark promotion offered");
  return data;
}

/* ------------------------------------------------------------
   MARK PROMOTION ACCEPTED
------------------------------------------------------------ */
async function markPromotionAccepted(waitlistId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .update({ promoted_at: new Date().toISOString() })
    .eq("waitlist_id", waitlistId)
    .select()
    .single();

  if (error) throw new Error("Failed to mark promotion accepted");
  return data;
}

/* ------------------------------------------------------------
   GET ACTIVE PROMOTION FOR USER
------------------------------------------------------------ */
async function getActivePromotionForUser(eventId, userId) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("promotion_offered", true)
    .is("promoted_at", null)
    .gt("promotion_expires_at", nowIso)
    .maybeSingle();

  if (error) throw new Error("Failed to fetch active promotion");
  return data;
}

/* ------------------------------------------------------------
   CLEAR EXPIRED PROMOTIONS FOR EVENT
------------------------------------------------------------ */
async function clearExpiredPromotionsForEvent(eventId) {
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("event_waitlist")
    .delete()
    .eq("event_id", eventId)
    .eq("promotion_offered", true)
    .is("promoted_at", null)
    .lt("promotion_expires_at", nowIso);

  if (error) throw new Error("Failed to clear expired promotions");
  return true;
}

/* ------------------------------------------------------------
   CLEAR PROMOTION (RESET FLAGS)
------------------------------------------------------------ */
async function clearPromotion(waitlistId) {
  const { data, error } = await supabase
    .from("event_waitlist")
    .update({
      promotion_offered: false,
      promotion_expires_at: null,
      promoted_at: null
    })
    .eq("waitlist_id", waitlistId)
    .select()
    .single();

  if (error) throw new Error("Failed to clear promotion");
  return data;
}

/* ------------------------------------------------------------
   GET WAITLIST + USER INFO
------------------------------------------------------------ */
async function getWaitlistWithUserInfo(eventId) {
  const { data, error } = await supabase
    .from("v_waitlist_queue")
    .select("*")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: true });

  if (!error) return data || [];

  // fallback
  const { data: wl } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", eventId)
    .order("joined_at");

  if (!wl || wl.length === 0) return [];

  const userIds = [...new Set(wl.map(w => w.user_id))];

  if (userIds.length === 0) return wl;

  const { data: users } = await supabase
    .from("User")
    .select("user_id, name, email")
    .in("user_id", userIds);

  const map = new Map();
  (users || []).forEach(u => map.set(u.user_id, u));

  return wl.map(w => ({
    ...w,
    user_name: map.get(w.user_id)?.name || null,
    user_email: map.get(w.user_id)?.email || null
  }));
}

/* ------------------------------------------------------------
   GET EXPIRED PROMOTIONS — REQUIRED BY CRON
------------------------------------------------------------ */
async function getExpiredPromotions() {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("promotion_offered", true)
    .is("promoted_at", null)
    .lt("promotion_expires_at", nowIso);

  if (error) throw new Error("Failed to fetch expired promotions");
  return data || [];
}

/* ------------------------------------------------------------
   AUTO PROMOTE NEXT USER (FIFO QUEUE LOGIC)
------------------------------------------------------------ */
async function autoPromoteNext(eventId) {
  // 1) Get next user in queue who has NOT been offered a promotion
  const next = await getNextUnofferedCandidate(eventId);
  if (!next) return null;

  // 2) Create 2-hour promotion window
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  // 3) Mark promotion
  const updated = await markPromotionOffered(next.waitlist_id, expiresAt);

  // 4) Insert notification for user (best effort)
  try {
    const { data: eventRow } = await supabase
      .from("event")
      .select("title")
      .eq("event_id", eventId)
      .single();

    await supabase.from("notification").insert([
      {
        user_id: next.user_id,
        message: `A slot has opened up for "${eventRow?.title || "an event"}". Please claim it before your promotion expires.`,
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    console.warn("Auto promotion notification failed:", err);
  }

  return updated;
}

/* ------------------------------------------------------------
   EXPORTS
------------------------------------------------------------ */
export {
  addUserToWaitlist,
  getWaitlistEntry,
  getWaitlistForEvent,
  removeUserFromWaitlist,
  deleteWaitlistById,
  getNextUnofferedCandidate,
  markPromotionOffered,
  markPromotionAccepted,
  getActivePromotionForUser,
  clearExpiredPromotionsForEvent,
  getWaitlistWithUserInfo,
  getWaitlistEntryById,
  removeWaitlistEntry,
  clearPromotion,
  getExpiredPromotions,
  autoPromoteNext,
};
