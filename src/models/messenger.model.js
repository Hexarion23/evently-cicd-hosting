import { supabase } from "./supabaseClient.js";

// ---------- helpers ----------
function dmKey(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

// ---------- auth / membership ----------
async function getUserProfileBasic(userId) {
  const { data, error } = await supabase
    .from("User")
    .select("user_id,name,email,user_type")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

async function getUserCcaMemberships(userId) {
  const { data, error } = await supabase
    .from("cca_membership")
    .select("cca_id,role")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

async function userHasCcaAccess(userId, ccaId) {
  const { data, error } = await supabase
    .from("cca_membership")
    .select("membership_id,role")
    .eq("user_id", userId)
    .eq("cca_id", ccaId)
    .maybeSingle();

  if (error) throw error;
  return data; // null if no access, else membership row
}

async function usersShareAnyCca(userA, userB) {
  // Get CCAs for A
  const { data: aRows, error: aErr } = await supabase
    .from("cca_membership")
    .select("cca_id")
    .eq("user_id", userA);
  if (aErr) throw aErr;

  const aSet = new Set((aRows || []).map(r => r.cca_id));
  if (aSet.size === 0) return false;

  // Check if B has any of those CCAs
  const { data: bRows, error: bErr } = await supabase
    .from("cca_membership")
    .select("cca_id")
    .eq("user_id", userB);
  if (bErr) throw bErr;

  return (bRows || []).some(r => aSet.has(r.cca_id));
}

async function teacherCanDmStudent(teacherId, studentId) {
  // teacher must have cca_membership.role='teacher' in some CCA,
  // and student must be member/exco in that same CCA.
  const { data: teacherCcas, error: tErr } = await supabase
    .from("cca_membership")
    .select("cca_id,role")
    .eq("user_id", teacherId);

  if (tErr) throw tErr;

  const teacherCcaIds = (teacherCcas || [])
    .filter(r => r.role === "teacher")
    .map(r => r.cca_id);

  if (teacherCcaIds.length === 0) return false;

  const { data: studentRows, error: sErr } = await supabase
    .from("cca_membership")
    .select("cca_id")
    .eq("user_id", studentId);

  if (sErr) throw sErr;

  const studentSet = new Set((studentRows || []).map(r => r.cca_id));
  return teacherCcaIds.some(id => studentSet.has(id));
}

// ---------- conversations ----------
async function ensureCcaGroupConversation(ccaId) {
  const { data: existing, error: eErr } = await supabase
    .from("conversation")
    .select("*")
    .eq("type", "CCA_GROUP")
    .eq("cca_id", ccaId)
    .maybeSingle();

  if (eErr) throw eErr;
  if (existing) return existing;

  // fetch cca name for title
  const { data: cca, error: ccaErr } = await supabase
    .from("cca")
    .select("name")
    .eq("cca_id", ccaId)
    .single();

  if (ccaErr) throw ccaErr;

  const { data: created, error: cErr } = await supabase
    .from("conversation")
    .insert([{ type: "CCA_GROUP", cca_id: ccaId, title: `${cca.name} Chat` }])
    .select()
    .single();

  if (cErr) throw cErr;
  return created;
}

async function ensureMember(conversationId, userId, roleInConvo = "member") {
  const { data: existing, error: eErr } = await supabase
    .from("conversation_member")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (eErr) throw eErr;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("conversation_member")
    .insert([{
      conversation_id: conversationId,
      user_id: userId,
      role_in_convo: roleInConvo
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function openOrCreateDm(userA, userB) {
  const key = dmKey(userA, userB);

  const { data: existing, error: eErr } = await supabase
    .from("conversation")
    .select("*")
    .eq("type", "DM")
    .eq("dm_key", key)
    .maybeSingle();

  if (eErr) throw eErr;
  if (existing) return existing;

  const { data: created, error: cErr } = await supabase
    .from("conversation")
    .insert([{ type: "DM", dm_key: key }])
    .select()
    .single();

  if (cErr) throw cErr;
  return created;
}

async function listUserConversations(userId) {
  const { data: convos, error } = await supabase
    .from("conversation_member")
    .select(`
      conversation_id,
      role_in_convo,
      last_read_at,
      conversation:conversation_id (
        conversation_id, type, cca_id, event_id, title, dm_key, created_at
      )
    `)
    .eq("user_id", userId);

  if (error) throw error;
  return (convos || []).map(r => ({
    ...r.conversation,
    my_role_in_convo: r.role_in_convo,
    my_last_read_at: r.last_read_at
  }));
}

async function getConversationMembers(conversationId) {
  const { data, error } = await supabase
    .from("conversation_member")
    .select("user_id,role_in_convo,last_read_at")
    .eq("conversation_id", conversationId);

  if (error) throw error;
  return data || [];
}

async function userIsMemberOfConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from("conversation_member")
    .select("user_id,role_in_convo,last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data; // null if not member
}

// ---------- messages ----------
async function getMessages(conversationId, limit = 30, before) {
  let q = supabase
    .from("message")
    .select(`
      message_id,
      conversation_id,
      sender_id,
      content,
      is_system,
      created_at,
      deleted_at,
      deleted_by,
      sender:User!msg_sender_fk ( user_id, name )
    `)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) throw error;

  // return ascending for UI
  return (data || []).reverse();
}

async function insertMessage(conversationId, senderId, content, isSystem = false) {
  const payload = {
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    is_system: isSystem,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("message")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function markRead(conversationId, userId) {
  const { data, error } = await supabase
    .from("conversation_member")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function countUnread(conversationId, userId, lastReadAt) {
  let q = supabase
    .from("message")
    .select("message_id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .neq("sender_id", userId);

  if (lastReadAt) q = q.gt("created_at", lastReadAt);

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function getLatestMessagePreview(conversationId) {
  const { data, error } = await supabase
    .from("message")
    .select("message_id,content,created_at,is_system,sender_id")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) ? data[0] : null;
}

async function searchConversationMessages(conversationId, q, limit = 20) {
  // ILIKE search; keep it simple + effective
  const { data, error } = await supabase
    .from("message")
    .select("message_id,content,created_at,sender_id,is_system")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .ilike("content", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ---------- moderation ----------
async function softDeleteMessage(messageId, deletedBy) {
  const { data, error } = await supabase
    .from("message")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy
    })
    .eq("message_id", messageId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getMessageById(messageId) {
  const { data, error } = await supabase
    .from("message")
    .select("message_id,conversation_id,sender_id,created_at,deleted_at")
    .eq("message_id", messageId)
    .single();

  if (error) throw error;
  return data;
}

async function setPinned(conversationId, messageId, pinnedBy) {
  const { data, error } = await supabase
    .from("pinned_message")
    .upsert([{
      conversation_id: conversationId,
      message_id: messageId,
      pinned_by: pinnedBy,
      pinned_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getPinned(conversationId) {
  const { data, error } = await supabase
    .from("pinned_message")
    .select(`
      conversation_id,
      pinned_at,
      pinned_by,
      message:message_id (
        message_id,
        content,
        created_at,
        sender_id,
        is_system,
        sender:User!msg_sender_fk ( user_id, name )
      )
    `)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}


async function reportMessage(messageId, reportedBy, reason) {
  const { data, error } = await supabase
    .from("message_report")
    .insert([{
      message_id: messageId,
      reported_by: reportedBy,
      reason: reason || null,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function searchUsers(q, limit = 10) {
  const term = q.trim();

  const { data, error } = await supabase
    .from("User")
    .select("user_id,name,email,user_type")
    .or(`name.ilike.%${term}%,email.ilike.%${term}%,admin_number.ilike.%${term}%`)
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function getAnySharedCcaId(userA, userB) {
  const { data: aRows, error: aErr } = await supabase
    .from("cca_membership")
    .select("cca_id")
    .eq("user_id", userA);
  if (aErr) throw aErr;

  const aSet = new Set((aRows || []).map(r => r.cca_id));
  if (aSet.size === 0) return null;

  const { data: bRows, error: bErr } = await supabase
    .from("cca_membership")
    .select("cca_id")
    .eq("user_id", userB);
  if (bErr) throw bErr;

  const shared = (bRows || []).find(r => aSet.has(r.cca_id));
  return shared ? shared.cca_id : null;
}

async function countRecentDmRequests(requesterId, windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("dm_request")
    .select("request_id", { count: "exact", head: true })
    .eq("requester_id", requesterId)
    .gte("created_at", since);

  if (error) throw error;
  return count || 0;
}

async function createDmRequest(requesterId, targetId, message, ccaId = null) {
  const payload = {
    requester_id: requesterId,
    target_id: targetId,
    cca_id: ccaId,
    status: "pending",
    message: message || null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("dm_request")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listDmRequestsInbox(targetId, limit = 30) {
  const { data, error } = await supabase
    .from("dm_request")
    .select(`
      request_id, requester_id, target_id, cca_id, status, message, created_at, responded_at, responded_by,
      requester:requester_id ( user_id, name, email, user_type )
    `)
    .eq("target_id", targetId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function getDmRequestById(requestId) {
  const { data, error } = await supabase
    .from("dm_request")
    .select("request_id, requester_id, target_id, cca_id, status, message, created_at, responded_at, responded_by")
    .eq("request_id", requestId)
    .single();

  if (error) throw error;
  return data;
}

async function respondDmRequest(requestId, responderId, action) {
  const newStatus = action === "approve" ? "approved" : "rejected";

  const { data, error } = await supabase
    .from("dm_request")
    .update({
      status: newStatus,
      responded_at: new Date().toISOString(),
      responded_by: responderId
    })
    .eq("request_id", requestId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function unpin(conversationId) {
  const { error } = await supabase
    .from("pinned_message")
    .delete()
    .eq("conversation_id", conversationId);

  if (error) throw error;
  return { conversation_id: conversationId };
}


async function getCcaStaff(ccaId) {
  const { data, error } = await supabase
    .from("cca_membership")
    .select("user_id,role")
    .eq("cca_id", ccaId)
    .in("role", ["teacher", "exco"]);
  if (error) throw error;
  return data || [];
}

async function createModerationCase({
  report_id,
  scope = "CCA",
  cca_id,
  conversation_id,
  message_id,
  reporter_id,
  reported_user_id
}) {
  const { data, error } = await supabase
    .from("moderation_case")
    .insert([{
      report_id,
      scope,                       // ✅ NEW
      cca_id: cca_id || null,
      conversation_id,
      message_id,
      reporter_id,
      reported_user_id: reported_user_id || null,
      status: "OPEN"
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}


async function listModerationInboxForStaff(userId, limit = 30) {
  const me = await getUserProfileBasic(userId);
  const isTeacher = me.user_type === "teacher";
  const isExco = me.user_type === "exco";

  if (!isTeacher && !isExco) return [];

  // Staff CCA list (for CCA scope cases)
  const { data: ccas, error: cErr } = await supabase
    .from("cca_membership")
    .select("cca_id,role")
    .eq("user_id", userId)
    .in("role", ["teacher", "exco"]);
  if (cErr) throw cErr;

  const ccaIds = (ccas || []).map((x) => x.cca_id);

  // Base query includes:
  // - conversation meta (type/title)
  // - reporter/offender
  // - report reason
  // - evidence message (content, sender, timestamps)
  let q = supabase
    .from("moderation_case")
    .select(
      `
      case_id, scope, status, created_at, cca_id, conversation_id, message_id, report_id,
      conversation:conversation_id ( conversation_id, type, title, cca_id ),
      reporter:reporter_id ( user_id, name, user_type ),
      offender:reported_user_id ( user_id, name, user_type ),
      report:report_id ( report_id, reason, created_at ),
      evidence:message_id (
        message_id,
        content,
        created_at,
        sender_id,
        is_system,
        deleted_at,
        sender:User!msg_sender_fk ( user_id, name )
      )
    `
    )
    .in("status", ["OPEN", "SUSPENDED"])
    .order("created_at", { ascending: false })
    .limit(limit);

  // Visibility rules:
  // - Teachers: see DM scope + CCA scope for CCAs they belong to
  // - EXCO: see only CCA scope for CCAs they belong to
  if (isTeacher) {
    if (ccaIds.length > 0) {
      q = q.or(
        `scope.eq.DM,and(scope.eq.CCA,cca_id.in.(${ccaIds.join(",")}))`
      );
    } else {
      q = q.eq("scope", "DM");
    }
  } else {
    if (ccaIds.length === 0) return [];
    q = q.eq("scope", "CCA").in("cca_id", ccaIds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}



async function getActiveSuspension(userId) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_suspension")
    .select("suspension_id,user_id,start_at,end_at,reason,created_by,created_at,lifted_by,lifted_reason,lifted_at,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("lifted_at", null)
    .gte("end_at", nowIso)
    .order("end_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}



async function countRecentWarnings(userId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { count, error } = await supabase
    .from("user_warning")
    .select("warning_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) throw error;
  return count || 0;
}


async function issueWarning({ user_id, case_id, issued_by, reason, expires_at = null }) {
  const exp =
    expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_warning")
    .insert([{ user_id, case_id, issued_by, reason: reason || null, expires_at: exp }])
    .select()
    .single();

  if (error) throw error;
  return data;
}


async function suspendUser({ user_id, created_by, reason, hours = 72 }) {
  const start = new Date();
  const end = new Date(Date.now() + Number(hours) * 60 * 60 * 1000);

  const payload = {
    user_id,
    created_by,
    reason: reason || null,
    start_at: start.toISOString(),
    end_at: end.toISOString(), // ✅ IMPORTANT: end_at (NOT ends_at)
  };

  const { data, error } = await supabase
    .from("user_suspension")
    .insert(payload)
    .select("suspension_id,user_id,start_at,end_at,reason,created_by,created_at")
    .single();

  if (error) throw error;
  return data;
}


async function resolveModerationCase(caseId, status, assignedTo, actionTaken, actionNote) {
  const { data, error } = await supabase
    .from("moderation_case")
    .update({
      status,
      assigned_to: assignedTo,
      action_taken: actionTaken || null,
      action_note: actionNote || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("case_id", caseId)
    // ✅ allow transitioning from either OPEN or SUSPENDED
    .in("status", ["OPEN", "SUSPENDED"])
    .select()
    .maybeSingle(); // ✅ returns null if 0 rows instead of throwing PGRST116

  if (error) throw error;

  // ✅ don't crash caller; return null if nothing updated
  return data || null;
}




async function isUserSuspended(userId) {
  const s = await getActiveSuspension(userId);
  return !!s;
}

async function liftSuspension({ user_id, lifted_by, reason }) {
  const uid = Number(user_id);
  const staffId = Number(lifted_by);
  const note =
    String(reason || "").slice(0, 300) || "Suspension lifted by staff";
  const nowIso = new Date().toISOString();

  // 1) Find ALL active suspensions for this user (can be >1, so no .single())
  const { data: actives, error: findErr } = await supabase
    .from("user_suspension")
    .select("suspension_id")
    .eq("user_id", uid)
    .eq("is_active", true)
    .is("lifted_at", null);

  if (findErr) throw findErr;

  if (!actives || actives.length === 0) {
    return { lifted: false, reason: "No active suspension found", user_id: uid };
  }

  const ids = actives.map((r) => r.suspension_id);

  // 2) Lift them (bulk update)
  const { data: updated, error: liftErr } = await supabase
    .from("user_suspension")
    .update({
      is_active: false,
      lifted_at: nowIso,
      lifted_by: staffId,
      lifted_reason: note, // ✅ your schema column
      lift_reason: note,   // ✅ keep in sync (since column exists)
    })
    .in("suspension_id", ids)
    .select("suspension_id,user_id,is_active,lifted_at,lifted_by,lifted_reason");

  if (liftErr) throw liftErr;

  return {
    lifted: true,
    count: updated ? updated.length : ids.length,
    user_id: uid,
    lifted_by: staffId,
    updated: updated || [],
  };
}



async function getGlobalModerators() {
  const { data, error } = await supabase
    .from("User")
    .select("user_id,name,user_type")
    .eq("user_type", "teacher");

  if (error) throw error;
  return data || [];
}

// ✅ Global moderator = any Teacher (simple + mark-max for DM moderation inbox)
async function isGlobalModerator(userId) {
  const me = await getUserProfileBasic(userId);
  return String(me?.user_type || "").toLowerCase() === "teacher";
}







export {
  dmKey,

  getUserProfileBasic,
  getUserCcaMemberships,
  userHasCcaAccess,
  usersShareAnyCca,
  teacherCanDmStudent,

  ensureCcaGroupConversation,
  ensureMember,
  openOrCreateDm,
  listUserConversations,
  getConversationMembers,
  userIsMemberOfConversation,

  getMessages,
  insertMessage,
  markRead,
  countUnread,
  getLatestMessagePreview,
  searchConversationMessages,

  softDeleteMessage,
  getMessageById,
  setPinned,
  getPinned,
  unpin,
  reportMessage,
  searchUsers,

   // ✅ DM Request layer
  getAnySharedCcaId,
  countRecentDmRequests,
  createDmRequest,
  listDmRequestsInbox,
  getDmRequestById,
  respondDmRequest,

  getCcaStaff,
  createModerationCase,
  listModerationInboxForStaff,
  getActiveSuspension,
  countRecentWarnings,
  issueWarning,
  suspendUser,
  resolveModerationCase,
  getGlobalModerators,
  isGlobalModerator,
  isUserSuspended,
  liftSuspension
};
