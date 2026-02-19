const { supabase } = require("./supabaseClient");


// =====================================================
// CREATE NOTIFICATION (UPGRADED - Option B)
// Backward compatible:
// createNotification(userId, message)
// createNotification(userId, message, { notification_type, conversation_id, event_id })
// =====================================================
module.exports.createNotification = async function createNotification(userId, message, meta = {}) {
  const payload = {
    user_id: userId,
    message,
    is_read: false,
    created_at: new Date().toISOString(),
    notification_type: meta.notification_type || null,
    conversation_id: meta.conversation_id ?? null,
    event_id: meta.event_id ?? null,
  };

  const { data, error } = await supabase
    .from("notification")
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating notification:", error);
    throw new Error(error.message || "Failed to create notification");
  }

  return data || null;
};

// =====================================================
// CREATE NOTIFICATION FOR EXCO WHEN EVENT CREATED
// =====================================================
module.exports.notifyExcoEventCreated = async function notifyExcoEventCreated(userId, event) {
  try {
    const message = `Your event "${event.title}" has been created successfully`;
    return await module.exports.createNotification(userId, message);
  } catch (err) {
    console.error("notifyExcoEventCreated error:", err);
    return null;
  }
};

// =====================================================
// CREATE NOTIFICATION FOR EXCO WHEN EVENT EDITED
// =====================================================
module.exports.notifyExcoEventEdited = async function notifyExcoEventEdited(userId, event) {
  try {
    const message = `You have updated "${event.title}"`;
    return await module.exports.createNotification(userId, message);
  } catch (err) {
    console.error("notifyExcoEventEdited error:", err);
    return null;
  }
};

// =====================================================
// CREATE NOTIFICATIONS FOR ALL SIGNUPS - EVENT COMING UP
// =====================================================
module.exports.notifyUsersEventComingUp = async function notifyUsersEventComingUp(eventId, event) {
  try {
    // Get all users who signed up for this event
    const { data: signups, error: signupError } = await supabase
      .from("event_signup")
      .select("user_id")
      .eq("event_id", eventId);

    if (signupError) {
      console.error("Error fetching signups:", signupError);
      return 0;
    }

    if (!signups || signups.length === 0) {
      return 0;
    }

    const message = `"${event.title}" is coming up soon!`;

    // Create notification for each user
    const promises = signups.map((signup) =>
      module.exports.createNotification(signup.user_id, message).catch(() => null)
    );

    await Promise.all(promises);
    console.log(`✅ Event coming up notifications sent to ${signups.length} users`);
    return signups.length;
  } catch (err) {
    console.error("notifyUsersEventComingUp error:", err);
    return 0;
  }
};

// =====================================================
// CREATE NOTIFICATIONS FOR ALL SIGNUPS - EVENT CONCLUDED
// =====================================================
module.exports.notifyUsersEventConcluded = async function notifyUsersEventConcluded(eventId, event) {
  try {
    // Get all users who signed up for this event
    const { data: signups, error: signupError } = await supabase
      .from("event_signup")
      .select("user_id")
      .eq("event_id", eventId);

    if (signupError) {
      console.error("Error fetching signups:", signupError);
      return 0;
    }

    if (!signups || signups.length === 0) {
      return 0;
    }

    const message = `"${event.title}" has concluded`;

    // Create notification for each user
    const promises = signups.map((signup) =>
      module.exports.createNotification(signup.user_id, message).catch(() => null)
    );

    await Promise.all(promises);
    console.log(`✅ Event concluded notifications sent to ${signups.length} users`);
    return signups.length;
  } catch (err) {
    console.error("notifyUsersEventConcluded error:", err);
    return 0;
  }
};

// =====================================================
// CREATE NOTIFICATION FOR EXCO - SIGNUP COUNT UPDATE
// =====================================================
module.exports.notifyExcoSignupCount = async function notifyExcoSignupCount(userId, event, signupCount) {
  try {
    const message = `${signupCount} member(s) have signed up for "${event.title}"`;
    return await module.exports.createNotification(userId, message);
  } catch (err) {
    console.error("notifyExcoSignupCount error:", err);
    return null;
  }
};
