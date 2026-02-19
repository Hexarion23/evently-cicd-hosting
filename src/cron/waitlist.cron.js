// src/cron/waitlist.cron.js

import cron from "node-cron";
import * as waitlistModel from "../models/waitlist.model.js";
import * as waitlistController from "../controllers/waitlist.controller.js";

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("⏳ CRON: Checking for expired promotions...");

  try {
    // 1. Pull all waitlist entries where promotions have expired
    const nowIso = new Date().toISOString();

    const { data: expired, error } = await waitlistModel.supabase
      .from("event_waitlist")
      .select("*")
      .eq("promotion_offered", true)
      .is("promoted_at", null)
      .lt("promotion_expires_at", nowIso);

    if (error) {
      console.error("❌ CRON fetch error:", error);
      return;
    }

    if (!expired || expired.length === 0) {
      console.log("✔ No expired promotions.");
      return;
    }

    console.log(`⚠ Found ${expired.length} expired promotions.`);

    // 2. Remove expired entries & auto-promote next users
    for (const entry of expired) {
      const { waitlist_id, event_id } = entry;

      // Remove expired promotion
      await waitlistModel.removeWaitlistEntry(waitlist_id);
      console.log(`🗑 Removed expired waitlist entry ${waitlist_id}`);

      // Promote next candidate using the SAME logic as backend
      await waitlistController._cronAutoPromote(event_id);
    }

  } catch (err) {
    console.error("❌ CRON ERROR:", err);
  }
});
