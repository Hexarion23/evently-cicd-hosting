// ============================
// NOTIFICATIONS UTILITY
// ============================


import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://fyfyvadrabgptmbiuvcl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Znl2YWRyYWJncHRtYml1dmNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDE5OTYsImV4cCI6MjA3ODc3Nzk5Nn0.kcqDjL3ZaZVOlVU7sDlcl6x5MxrWPlZ_681hzYbbSbQ"
);


/**
 * Create a notification in the database
 * @param {number} userId - The user_id for the notification
 * @param {string} message - The notification message
 * @returns {Promise<Object>} - The created notification object
 */
async function createNotification(userId, message) {
  try {
    const { data, error } = await supabase
      .from("notification")
      .insert([
        {
          user_id: userId,
          message: message,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating notification:", error);
      return null;
    }

    console.log("Notification created:", data);
    return data;
  } catch (err) {
    console.error("createNotification error:", err);
    return null;
  }
}

/**
 * Create a notification for a user who signed up for an event
 * @param {number} userId - The user who signed up
 * @param {Object} event - The event object
 */
async function notifyUserSignup(userId, event) {
  const message = `You have signed up for "${event.title}"`;
  return createNotification(userId, message);
}

/**
 * Create a notification for EXCO when they create an event
 * @param {number} userId - The EXCO user
 * @param {Object} event - The created event object
 */
async function notifyExcoEventCreated(userId, event) {
  const message = `Your event "${event.title}" has been created successfully`;
  return createNotification(userId, message);
}

/**
 * Create a notification for EXCO when they edit an event
 * @param {number} userId - The EXCO user
 * @param {Object} event - The event object
 */
async function notifyExcoEventEdited(userId, event) {
  const message = `You have updated "${event.title}"`;
  return createNotification(userId, message);
}

/**
 * Create a notification for a user when they mark attendance
 * @param {number} userId - The user who marked attendance
 * @param {Object} event - The event object
 * @param {string} status - The attendance status ('present' or 'absent')
 */
async function notifyUserAttendanceMarked(userId, event, status) {
  const statusText = status === "present" ? "present" : "absent";
  const message = `Your attendance for "${event.title}" has been marked as ${statusText}`;
  return createNotification(userId, message);
}

/**
 * Create a notification for EXCO showing signup count
 * @param {number} userId - The EXCO user
 * @param {Object} event - The event object
 * @param {number} signupCount - Number of signups
 */
async function notifyExcoSignupUpdate(userId, event, signupCount) {
  const message = `${signupCount} member(s) have signed up for "${event.title}"`;
  return createNotification(userId, message);
}

/**
 * Create notifications for all users who signed up that event is coming up
 * @param {number} eventId - The event ID
 * @param {Object} event - The event object
 */
async function notifyUserEventComingUp(eventId, event) {
  try {
    // Get all users who signed up
    const { data: signups, error: signupError } = await supabase
      .from("event_signup")
      .select("user_id")
      .eq("event_id", eventId);

    if (signupError) {
      console.error("Error fetching signups:", signupError);
      return;
    }

    if (!signups || signups.length === 0) return;

    // Create notification for each user
    const message = `"${event.title}" is coming up!`;
    const notificationPromises = signups.map((signup) =>
      createNotification(signup.user_id, message)
    );

    await Promise.all(notificationPromises);
    console.log(
      `Event coming up notifications sent to ${signups.length} users`
    );
  } catch (err) {
    console.error("notifyUserEventComingUp error:", err);
  }
}

/**
 * Create notifications for all users who signed up that event has concluded
 * @param {number} eventId - The event ID
 * @param {Object} event - The event object
 */
async function notifyUserEventConcluded(eventId, event) {
  try {
    // Get all users who signed up
    const { data: signups, error: signupError } = await supabase
      .from("event_signup")
      .select("user_id")
      .eq("event_id", eventId);

    if (signupError) {
      console.error("Error fetching signups:", signupError);
      return;
    }

    if (!signups || signups.length === 0) return;

    // Create notification for each user
    const message = `"${event.title}" has concluded`;
    const notificationPromises = signups.map((signup) =>
      createNotification(signup.user_id, message)
    );

    await Promise.all(notificationPromises);
    console.log(
      `Event concluded notifications sent to ${signups.length} users`
    );
  } catch (err) {
    console.error("notifyUserEventConcluded error:", err);
  }
}

/**
 * Create a notification for EXCO that event is coming up
 * @param {number} userId - The EXCO user
 * @param {Object} event - The event object
 */
async function notifyExcoEventComingUp(userId, event) {
  const message = `Your event "${event.title}" is coming up soon!`;
  return createNotification(userId, message);
}

/**
 * Fetch all unread notifications for a user
 * @param {number} userId - The user ID
 * @returns {Promise<Array>} - Array of notification objects
 */
async function fetchUnreadNotifications(userId) {
  try {
    const { data, error } = await supabase
      .from("notification")
      .select("*")
      .eq("user_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("fetchUnreadNotifications error:", err);
    return [];
  }
}

/**
 * Fetch all notifications for a user (read and unread)
 * @param {number} userId - The user ID
 * @param {number} limit - Max number of notifications to fetch
 * @returns {Promise<Array>} - Array of notification objects
 */
async function fetchAllNotifications(userId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from("notification")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching all notifications:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("fetchAllNotifications error:", err);
    return [];
  }
}

/**
 * Mark a notification as read
 * @param {number} notificationId - The notification ID
 * @returns {Promise<boolean>} - True if successful
 */
async function markNotificationAsRead(notificationId) {
  try {
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("notification_id", notificationId);

    if (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("markNotificationAsRead error:", err);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 * @param {number} userId - The user ID
 * @returns {Promise<boolean>} - True if successful
 */
async function markAllNotificationsAsRead(userId) {
  try {
    const { error } = await supabase
      .from("notification")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("markAllNotificationsAsRead error:", err);
    return false;
  }
}

/**
 * Get count of unread notifications for a user
 * @param {number} userId - The user ID
 * @returns {Promise<number>} - Count of unread notifications
 */
async function getUnreadNotificationCount(userId) {
  try {
    const { count, error } = await supabase
      .from("notification")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error getting unread count:", error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error("getUnreadNotificationCount error:", err);
    return 0;
  }
}


export { 
  fetchAllNotifications, 
  getUnreadNotificationCount, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
};