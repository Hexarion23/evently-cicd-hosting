const { supabase } = require("./supabaseClient");

// =====================================================
// GET ALL EVENTS (Dashboard uses this)
// =====================================================
module.exports.getAllEvents = async function getAllEvents() {
  const { data, error } = await supabase
    .from("event")
    .select("*")
    .order("start_datetime", { ascending: true });

  if (error) {
    console.error("❌ Error fetching events:", error);
    throw error;
  }
  return data || [];
};

// =====================================================
// GET UPCOMING EVENTS (Optional, KEEPING YOUR ORIGINAL)
// =====================================================
module.exports.getUpcomingEvents = async function getUpcomingEvents() {
  const now = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Singapore" })
    .replace(" ", "T");

  const { data, error } = await supabase
    .from("event")
    .select("*")
    .gte("start_datetime", now)
    .order("start_datetime", { ascending: true });

  if (error) {
    console.error("❌ Error fetching upcoming events:", error);
    throw error;
  }
  return data || [];
};

// =====================================================
// GET SINGLE EVENT BY ID (NEW)
// =====================================================
module.exports.getEventById = async function getEventById(eventId) {
  const { data, error } = await supabase
    .from("event")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (error) {
    console.error("❌ Error fetching event by ID:", error);
    throw error;
  }

  return data;
};

// =====================================================
// CREATE NEW EVENT (KEEPING YOUR ORIGINAL LOGIC)
// =====================================================
module.exports.createEvent = async function createEvent(eventData) {
  const { data, error } = await supabase
    .from("event")
    .insert([
      {
        title: eventData.title,
        description: eventData.description || null,
        cca_id: eventData.cca_id,
        start_datetime: eventData.start_datetime,
        sign_up_deadline: eventData.sign_up_deadline || null,
        cca_points: eventData.cca_points || null,
        end_datetime: eventData.end_datetime,
        location: eventData.location,
        image_path: eventData.image_path || null,
        visibility: eventData.visibility,
        cca_points_category: eventData.cca_points_category || null,
        capacity: eventData.capacity,
        qr_code: eventData.qr_code || null,
        qr_image_path: eventData.qr_image_path || null,
        created_by: eventData.created_by || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating event:", error);
    throw error;
  }

  return data;
};

// =====================================================
// UPDATE EVENT (NEW)
// =====================================================
module.exports.updateEvent = async function updateEvent(eventId, updates) {
  const { data, error } = await supabase
    .from("event")
    .update(updates)
    .eq("event_id", eventId)
    .select()
    .single();

  if (error) {
    console.error("❌ Error updating event:", error);
    throw error;
  }

  return data;
};

// =====================================================
// DELETE EVENT (NEW)
// =====================================================
module.exports.deleteEvent = async function deleteEvent(eventId) {
  const { error } = await supabase
    .from("event")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    console.error("❌ Error deleting event:", error);
    throw error;
  }

  return true;
};

module.exports.upsertEventDetails = async function upsertEventDetails(
  eventId,
  details,
) {
  const { data: existing } = await supabase
    .from("event_details")
    .select("detail_id")
    .eq("event_id", eventId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("event_details")
      .update(details)
      .eq("event_id", eventId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("event_details")
    .insert([{ event_id: eventId, ...details }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

module.exports.getSignupCount = async function getSignupCount(eventId) {
  const { count, error } = await supabase
    .from("event_signup")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    console.error("❌ Error counting signups:", error);
    throw error;
  }

  return count || 0;
};

module.exports.addSignup = async function addSignup(eventId, userId) {
  const { error } = await supabase
    .from("event_signup")
    .insert([{ event_id: eventId, user_id: userId }]);

  if (error) {
    console.error("❌ Error adding signup:", error);
    throw error;
  }

  return true;
};

module.exports.removeSignup = async function removeSignup(eventId, userId) {
  const { error } = await supabase
    .from("event_signup")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) {
    console.error("❌ Error removing signup:", error);
    throw error;
  }

  return true;
};

module.exports.getFeedbackByEvent = async function getFeedbackByEvent(eventId) {
  const { data, error } = await supabase
    .from("event_feedback")
    .select(
      `
        *,
        User ( name, email )
      `,
    ) 
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};

module.exports.getFeedbackStats = async function getFeedbackStats(eventId) {
  const { data, error } = await supabase
    .from("event_feedback")
    .select("rating")
    .eq("event_id", eventId);

  if (error) throw error;

  const totalResponses = data.length;
  if (totalResponses === 0) return null;

  // Calculate Average
  const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
  const average = (sum / totalResponses).toFixed(1);

  // Calculate Distribution (1-5 stars)
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.forEach((item) => {
    distribution[item.rating] = (distribution[item.rating] || 0) + 1;
  });

  return {
    average,
    totalResponses,
    distribution,
  };
};
