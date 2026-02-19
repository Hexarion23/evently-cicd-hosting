import jwt from "jsonwebtoken";
import createError from "http-errors";

import messengerModel from "../models/messenger.model.js";
import { createNotification } from "../models/notification.model.js";

const JWT_SECRET = process.env.JWT_SECRET;

// ------------------------
// Simple rate limiter (in-memory)
// max 5 msgs / 10 seconds / user
// ------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;
const userMsgTimes = new Map();

function rateLimitOrThrow(userId) {
  const now = Date.now();
  const arr = userMsgTimes.get(userId) || [];
  const recent = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX)
    throw createError(429, "Too many messages. Please slow down.");
  recent.push(now);
  userMsgTimes.set(userId, recent);
}

function getAuth(req) {
  const token = req.cookies.token;
  if (!token) throw createError(401, "Not authenticated");
  try {
    return jwt.verify(token, JWT_SECRET); // { id, admin_number, role }
  } catch {
    throw createError(401, "Invalid token");
  }
}

// Escape basic dangerous chars (store plain text anyway, but be safe)
function normalizeMessageContent(s) {
  const msg = (s ?? "").toString().trim();
  if (!msg) throw createError(400, "Message cannot be empty");
  if (msg.length > 800)
    throw createError(400, "Message too long (max 800 chars)");
  return msg;
}

function isStaff(userType) {
  return userType === "teacher" || userType === "exco";
}

// Student -> (teacher/exco) requires approval
function needsDmApproval(requesterType, targetType) {
  return requesterType === "student" && isStaff(targetType);
}

function normalizeRequestMessage(s) {
  const msg = (s ?? "").toString().trim();
  if (!msg) return null;
  if (msg.length > 200)
    throw createError(400, "Request message too long (max 200 chars)");
  return msg;
}

function mapUserTypeToConvoRole(userType) {
  // conversation_member.role_in_convo allows: member|exco|teacher|system
  // User.user_type allows: student|exco|teacher
  if (userType === "student") return "member";
  return userType; // exco / teacher stay the same
}

// Build display name for a DM conversation
async function getDmOtherUser(convo, myUserId) {
  // dm_key is "a:b"
  const parts = (convo.dm_key || "").split(":").map(Number);
  const otherId = parts[0] === Number(myUserId) ? parts[1] : parts[0];
  const other = await messengerModel.getUserProfileBasic(otherId);
  return other;
}

// ------------------------
// GET /api/messenger/conversations
// ------------------------
async function listConversations(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    // ✅ AUTO-JOIN: ensure the user is a member of all their CCA group chats
    // This makes the sidebar populate immediately (no empty screen issue).
    const memberships = await messengerModel.getUserCcaMemberships(myId);

    for (const m of memberships) {
      const convo = await messengerModel.ensureCcaGroupConversation(m.cca_id);
      await messengerModel.ensureMember(convo.conversation_id, myId, m.role);
    }

    // Now load all conversations the user belongs to
    const convos = await messengerModel.listUserConversations(myId);

    // decorate with: title, last message, unread count
    const out = [];

    for (const c of convos) {
      // unread
      const unread = await messengerModel.countUnread(
        c.conversation_id,
        myId,
        c.my_last_read_at,
      );

      // last message preview
      const lastMsg = await messengerModel.getLatestMessagePreview(
        c.conversation_id,
      );

      let title = c.title || "Chat";

      if (c.type === "CCA_GROUP" && c.cca_id) {
        // title already seeded as "<CCA Name> Chat"
        title = c.title || "CCA Chat";
      }

      if (c.type === "DM") {
        const other = await getDmOtherUser(c, myId);
        title = other?.name ? other.name : "Direct Message";
      }

      if (c.type === "EVENT_THREAD") {
        title = c.title || "Event Chat";
      }

      out.push({
        conversation_id: c.conversation_id,
        type: c.type,
        cca_id: c.cca_id,
        event_id: c.event_id,
        title,
        unread,
        last_message: lastMsg
          ? {
              content: lastMsg.content,
              created_at: lastMsg.created_at,
              sender_id: lastMsg.sender_id,
              is_system: lastMsg.is_system,
            }
          : null,
      });
    }

    // sort by last activity (last_message.created_at or created_at)
    out.sort((a, b) => {
      const at = a.last_message?.created_at || "1970-01-01";
      const bt = b.last_message?.created_at || "1970-01-01";
      return new Date(bt).getTime() - new Date(at).getTime();
    });

    res.json({ conversations: out });
  } catch (err) {
    next(err);
  }
}

// ------------------------
// POST /api/messenger/cca/:cca_id/open
// Ensures group convo exists + user is member/teacher/exco of that CCA
// ------------------------
async function openCcaGroup(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const ccaId = Number(req.params.cca_id);

    const membership = await messengerModel.userHasCcaAccess(myId, ccaId);
    if (!membership)
      throw createError(403, "You are not allowed to access this CCA chat");

    const convo = await messengerModel.ensureCcaGroupConversation(ccaId);

    // ensure membership in conversation_member with correct role_in_convo
    await messengerModel.ensureMember(
      convo.conversation_id,
      myId,
      membership.role,
    );

    res.json({ conversation: convo });
  } catch (err) {
    next(err);
  }
}

// ------------------------
// POST /api/messenger/dm/open { targetUserId }
// Enforces DM policy:
// - share CCA OR teacher↔member of teacher CCA
// ------------------------
async function openDm(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    await blockIfSuspended(myId);
    const targetUserId = Number(req.body.targetUserId);

    if (!targetUserId || Number.isNaN(targetUserId))
      throw createError(400, "targetUserId required");
    if (targetUserId === myId) throw createError(400, "Cannot DM yourself");

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    const targetProfile =
      await messengerModel.getUserProfileBasic(targetUserId);

    const shareCca = await messengerModel.usersShareAnyCca(myId, targetUserId);

    let teacherPolicy = false;
    if (meProfile.user_type === "teacher") {
      teacherPolicy = await messengerModel.teacherCanDmStudent(
        myId,
        targetUserId,
      );
    } else if (targetProfile.user_type === "teacher") {
      teacherPolicy = await messengerModel.teacherCanDmStudent(
        targetUserId,
        myId,
      );
    }

    if (!shareCca && !teacherPolicy) {
      throw createError(403, "DM not allowed (policy restriction)");
    }

    // ✅ Student -> staff => create/request, not open
    if (needsDmApproval(meProfile.user_type, targetProfile.user_type)) {
      // anti-spam: max 3/hour
      const recentCount = await messengerModel.countRecentDmRequests(myId, 60);
      if (recentCount >= 3)
        throw createError(429, "Too many DM requests. Please try again later.");

      // If pending exists, return pending (no conflict)
      const { supabase } = require("../models/supabaseClient");
      const { data: pending, error: pErr } = await supabase
        .from("dm_request")
        .select("request_id,status,created_at")
        .eq("requester_id", myId)
        .eq("target_id", targetUserId)
        .eq("status", "pending")
        .maybeSingle();
      if (pErr) throw pErr;

      if (pending) {
        return res.status(202).json({ status: "pending", request: pending });
      }

      const sharedCcaId = await messengerModel.getAnySharedCcaId(
        myId,
        targetUserId,
      );

      const reqRow = await messengerModel.createDmRequest(
        myId,
        targetUserId,
        null,
        sharedCcaId,
      );

      await createNotification(
        targetUserId,
        `New DM request from ${meProfile.name}`,
        { notification_type: "DM_REQUEST", request_id: reqRow.request_id },
      ).catch(() => null);

      return res.status(202).json({ status: "pending", request: reqRow });
    }

    // ✅ Otherwise open immediately
    const convo = await messengerModel.openOrCreateDm(myId, targetUserId);

    await messengerModel.ensureMember(
      convo.conversation_id,
      myId,
      mapUserTypeToConvoRole(meProfile.user_type),
    );
    await messengerModel.ensureMember(
      convo.conversation_id,
      targetUserId,
      mapUserTypeToConvoRole(targetProfile.user_type),
    );

    res.json({ conversation: convo });
  } catch (err) {
    next(err);
  }
}

// ------------------------
// GET /api/messenger/conversations/:conversation_id/messages?limit=30&before=ISO
// ------------------------
async function getMessages(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const conversationId = Number(req.params.conversation_id);

    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member)
      throw createError(403, "Not allowed to view this conversation");

    const limit = Math.min(Number(req.query.limit || 30), 50);
    const before = req.query.before ? String(req.query.before) : undefined;

    const messages = await messengerModel.getMessages(
      conversationId,
      limit,
      before,
    );
    res.json({ messages });
  } catch (err) {
    console.error("❌ getMessages failed:", err); // ✅ ADD THIS
    next(err);
  }
}

// ------------------------
// POST /api/messenger/conversations/:conversation_id/messages { content }
// Creates notifications for other members
// ------------------------
async function sendMessage(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id); // ✅ MUST be first
    const conversationId = Number(req.params.conversation_id);

    // ✅ VALIDATE FIRST (prevents DB / supabase mocks from being needed for empty content)
    const content = normalizeMessageContent(req.body.content);
    if (!content || !String(content).trim()) {
      throw createError(400, "Message content cannot be empty");
    }

    // ✅ Only after validation: membership checks / rate limit / DB writes
    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member)
      throw createError(403, "Not allowed to send in this conversation");

    rateLimitOrThrow(myId);

    const msg = await messengerModel.insertMessage(
      conversationId,
      myId,
      content,
      false,
    );

    // ✅ fetch convo meta first (needed for notification labeling)
    const { supabase } = require("../models/supabaseClient");
    const { data: convo, error: convoErr } = await supabase
      .from("conversation")
      .select("type,cca_id,title")
      .eq("conversation_id", conversationId)
      .single();
    if (convoErr) throw convoErr;

    // ✅ now safe to use myId everywhere
    const convoMembers =
      await messengerModel.getConversationMembers(conversationId);
    const sender = await messengerModel.getUserProfileBasic(myId);

    const notification_type =
      convo.type === "DM" ? "MESSAGE_DM" : "MESSAGE_CCA";
    const chatLabel =
      convo.type === "DM"
        ? `New message from ${sender.name}`
        : `New message in ${convo.title || "CCA chat"}`;

    await Promise.all(
      convoMembers
        .filter((m) => Number(m.user_id) !== myId)
        .map((m) =>
          createNotification(m.user_id, chatLabel, {
            notification_type,
            conversation_id: conversationId,
          }).catch(() => null),
        ),
    );

    res.status(201).json({ message: msg });
  } catch (err) {
    console.error("❌ sendMessage failed:", err); // helpful
    next(err);
  }
}


// ------------------------
// POST /api/messenger/conversations/:conversation_id/read
// ------------------------
async function markRead(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const conversationId = Number(req.params.conversation_id);

    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    const updated = await messengerModel.markRead(conversationId, myId);
    res.json({ status: "ok", member: updated });
  } catch (err) {
    next(err);
  }
}

// ------------------------
// GET /api/messenger/conversations/:conversation_id/search?q=...
// ------------------------
async function searchMessages(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const conversationId = Number(req.params.conversation_id);

    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json({ matches: [] });

    const matches = await messengerModel.searchConversationMessages(
      conversationId,
      q,
      20,
    );
    res.json({ matches });
  } catch (err) {
    next(err);
  }
}

// ------------------------
// Moderation: delete/pin/report
// ------------------------
async function softDeleteMessage(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const messageId = Number(req.params.message_id);

    const msg = await messengerModel.getMessageById(messageId);
    if (msg.deleted_at) return res.json({ status: "ok", message: msg });

    // must be member of convo
    const member = await messengerModel.userIsMemberOfConversation(
      msg.conversation_id,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    // permission: sender can delete own; OR exco/teacher can delete in group chats
    let allowed = msg.sender_id === myId;

    const { supabase } = require("../models/supabaseClient");
    const { data: convo, error: convoErr } = await supabase
      .from("conversation")
      .select("type,cca_id")
      .eq("conversation_id", msg.conversation_id)
      .single();
    if (convoErr) throw convoErr;

    if (!allowed && convo.type === "CCA_GROUP") {
      // require exco/teacher membership in that CCA
      const mem = await messengerModel.userHasCcaAccess(myId, convo.cca_id);
      allowed = !!mem && (mem.role === "exco" || mem.role === "teacher");
    }

    if (!allowed) throw createError(403, "Not allowed to delete this message");

    const updated = await messengerModel.softDeleteMessage(messageId, myId);
    res.json({ status: "ok", message: updated });
  } catch (err) {
    next(err);
  }
}

async function pinMessage(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const messageId = Number(req.params.message_id);

    const msg = await messengerModel.getMessageById(messageId);

    // must be member of convo
    const member = await messengerModel.userIsMemberOfConversation(
      msg.conversation_id,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    // only exco/teacher can pin (for CCA groups)
    const { supabase } = require("../models/supabaseClient");
    const { data: convo, error: convoErr } = await supabase
      .from("conversation")
      .select("type,cca_id")
      .eq("conversation_id", msg.conversation_id)
      .single();
    if (convoErr) throw convoErr;

    if (convo.type !== "CCA_GROUP")
      throw createError(400, "Pin is only for CCA group chats");

    const mem = await messengerModel.userHasCcaAccess(myId, convo.cca_id);
    if (!mem || (mem.role !== "exco" && mem.role !== "teacher")) {
      throw createError(403, "Only EXCO/Teacher can pin messages");
    }

    const pinned = await messengerModel.setPinned(
      msg.conversation_id,
      messageId,
      myId,
    );
    res.json({ status: "ok", pinned });
  } catch (err) {
    next(err);
  }
}

async function getPinned(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const conversationId = Number(req.params.conversation_id);

    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    const pinned = await messengerModel.getPinned(conversationId);
    res.json({ pinned });
  } catch (err) {
    next(err);
  }
}

async function reportMessage(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const messageId = Number(req.params.message_id);

    const msg = await messengerModel.getMessageById(messageId);

    const member = await messengerModel.userIsMemberOfConversation(
      msg.conversation_id,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    const reason = (req.body.reason || "").toString().trim().slice(0, 200);

    const report = await messengerModel.reportMessage(messageId, myId, reason);

    const { supabase } = require("../models/supabaseClient");
    const { data: convo, error: convoErr } = await supabase
      .from("conversation")
      .select("type,cca_id,title")
      .eq("conversation_id", msg.conversation_id)
      .single();
    if (convoErr) throw convoErr;

    const { data: fullMsg, error: mErr } = await supabase
      .from("message")
      .select("sender_id")
      .eq("message_id", messageId)
      .single();
    if (mErr) throw mErr;

    const reporter = await messengerModel.getUserProfileBasic(myId);

    let modCase = null;

    if (convo.type === "CCA_GROUP" && convo.cca_id) {
      modCase = await messengerModel.createModerationCase({
        report_id: report.report_id,
        scope: "CCA",
        cca_id: convo.cca_id,
        conversation_id: msg.conversation_id,
        message_id: messageId,
        reporter_id: myId,
        reported_user_id: fullMsg.sender_id,
      });

      const staff = await messengerModel.getCcaStaff(convo.cca_id);
      const alertText = `⚠️ Reported message in ${
        convo.title || "CCA Chat"
      } by ${reporter.name}`;

      await Promise.all(
        staff
          .filter((s) => Number(s.user_id) !== myId)
          .map((s) =>
            createNotification(s.user_id, alertText, {
              notification_type: "MESSAGE_REPORTED",
              conversation_id: msg.conversation_id,
              metadata: {
                scope: "CCA",
                case_id: modCase.case_id,
                report_id: report.report_id,
                message_id: messageId,
                cca_id: convo.cca_id,
              },
            }).catch(() => null),
          ),
      );
    }

    if (convo.type === "DM") {
      modCase = await messengerModel.createModerationCase({
        report_id: report.report_id,
        scope: "DM",
        cca_id: null,
        conversation_id: msg.conversation_id,
        message_id: messageId,
        reporter_id: myId,
        reported_user_id: fullMsg.sender_id,
      });

      const teachers = await messengerModel.getGlobalModerators();
      const alertText = `🚩 DM report by ${reporter.name} (Case #${modCase.case_id})`;

      await Promise.all(
        teachers
          .filter((t) => Number(t.user_id) !== myId)
          .map((t) =>
            createNotification(t.user_id, alertText, {
              notification_type: "MESSAGE_REPORTED_DM",
              conversation_id: msg.conversation_id,
              metadata: {
                scope: "DM",
                case_id: modCase.case_id,
                report_id: report.report_id,
                message_id: messageId,
              },
            }).catch(() => null),
          ),
      );
    }

    res.status(201).json({ status: "ok", report, case: modCase });
  } catch (err) {
    next(err);
  }
}

async function searchUsersForDm(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json({ users: [] });

    const raw = await messengerModel.searchUsers(q, 10);

    // enforce DM policy here (no random DM)
    const allowed = [];
    const meProfile = await messengerModel.getUserProfileBasic(myId);

    for (const u of raw) {
      if (u.user_id === myId) continue;

      const shareCca = await messengerModel.usersShareAnyCca(myId, u.user_id);

      let teacherPolicy = false;
      if (meProfile.user_type === "teacher") {
        teacherPolicy = await messengerModel.teacherCanDmStudent(
          myId,
          u.user_id,
        );
      } else if (u.user_type === "teacher") {
        teacherPolicy = await messengerModel.teacherCanDmStudent(
          u.user_id,
          myId,
        );
      }

      if (shareCca || teacherPolicy) {
        allowed.push(u);
      }
    }

    res.json({ users: allowed });
  } catch (err) {
    next(err);
  }
}

// POST /api/messenger/dm/request { targetUserId, message? }
async function createDmRequest(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    await blockIfSuspended(myId);
    const targetUserId = Number(req.body.targetUserId);
    const message = normalizeRequestMessage(req.body.message);

    if (!targetUserId || Number.isNaN(targetUserId))
      throw createError(400, "targetUserId required");
    if (targetUserId === myId)
      throw createError(400, "Cannot request DM to yourself");

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    const targetProfile =
      await messengerModel.getUserProfileBasic(targetUserId);

    // must require approval by rule
    if (!needsDmApproval(meProfile.user_type, targetProfile.user_type)) {
      throw createError(
        400,
        "Request not needed for this user (DM allowed directly)",
      );
    }

    // must still satisfy overall DM eligibility policy
    const shareCca = await messengerModel.usersShareAnyCca(myId, targetUserId);

    let teacherPolicy = false;
    if (targetProfile.user_type === "teacher") {
      teacherPolicy = await messengerModel.teacherCanDmStudent(
        targetUserId,
        myId,
      );
    } else if (meProfile.user_type === "teacher") {
      teacherPolicy = await messengerModel.teacherCanDmStudent(
        myId,
        targetUserId,
      );
    }

    if (!shareCca && !teacherPolicy) {
      throw createError(403, "DM not allowed (policy restriction)");
    }

    // basic anti-spam: max 3 requests / hour
    const recentCount = await messengerModel.countRecentDmRequests(myId, 60);
    if (recentCount >= 3) {
      throw createError(429, "Too many DM requests. Please try again later.");
    }

    // pick shared cca context (optional but nice)
    const sharedCcaId = await messengerModel.getAnySharedCcaId(
      myId,
      targetUserId,
    );

    const reqRow = await messengerModel.createDmRequest(
      myId,
      targetUserId,
      message,
      sharedCcaId,
    );

    // notify target staff user
    await createNotification(
      targetUserId,
      `New DM request from ${meProfile.name}`,
      { notification_type: "DM_REQUEST", conversation_id: null },
    ).catch(() => null);

    res.status(201).json({ status: "ok", request: reqRow });
  } catch (err) {
    // handle unique pending constraint as friendly msg
    if (
      String(err?.message || "")
        .toLowerCase()
        .includes("duplicate") ||
      String(err?.code || "") === "23505"
    ) {
      return next(
        createError(409, "You already have a pending request to this user."),
      );
    }
    next(err);
  }
}

// GET /api/messenger/dm/requests/inbox
async function listDmRequestsInbox(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    if (!isStaff(meProfile.user_type)) {
      throw createError(403, "Only EXCO/Teacher can view DM requests inbox");
    }

    const inbox = await messengerModel.listDmRequestsInbox(myId, 30);
    res.json({ requests: inbox });
  } catch (err) {
    next(err);
  }
}

// POST /api/messenger/dm/requests/:request_id/respond { action: "approve"|"reject" }
async function respondDmRequest(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const requestId = Number(req.params.request_id);
    const action = (req.body.action || "").toString().trim().toLowerCase();

    if (!requestId || Number.isNaN(requestId))
      throw createError(400, "request_id invalid");
    if (action !== "approve" && action !== "reject")
      throw createError(400, "action must be approve or reject");

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    if (!isStaff(meProfile.user_type)) {
      throw createError(403, "Only EXCO/Teacher can respond to DM requests");
    }

    const reqRow = await messengerModel.getDmRequestById(requestId);

    // only target can respond
    if (Number(reqRow.target_id) !== myId) {
      throw createError(403, "Not allowed to respond to this request");
    }

    if (reqRow.status !== "pending") {
      return res.json({
        status: "ok",
        request: reqRow,
        note: "Already handled",
      });
    }

    const updated = await messengerModel.respondDmRequest(
      requestId,
      myId,
      action,
    );

    // on approve -> open DM convo + ensure members
    let convo = null;
    if (action === "approve") {
      convo = await messengerModel.openOrCreateDm(
        reqRow.requester_id,
        reqRow.target_id,
      );

      const requesterProfile = await messengerModel.getUserProfileBasic(
        reqRow.requester_id,
      );
      const targetProfile = meProfile;

      await messengerModel.ensureMember(
        convo.conversation_id,
        reqRow.requester_id,
        mapUserTypeToConvoRole(requesterProfile.user_type),
      );

      await messengerModel.ensureMember(
        convo.conversation_id,
        reqRow.target_id,
        mapUserTypeToConvoRole(targetProfile.user_type),
      );

      await createNotification(
        reqRow.requester_id,
        `${meProfile.name} approved your DM request`,
        {
          notification_type: "DM_REQUEST_APPROVED",
          conversation_id: convo.conversation_id,
        },
      ).catch(() => null);
    } else {
      await createNotification(
        reqRow.requester_id,
        `${meProfile.name} rejected your DM request`,
        { notification_type: "DM_REQUEST_REJECTED", conversation_id: null },
      ).catch(() => null);
    }

    res.json({ status: "ok", request: updated, conversation: convo });
  } catch (err) {
    next(err);
  }
}

async function unpinMessage(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const conversationId = Number(req.params.conversation_id);

    const member = await messengerModel.userIsMemberOfConversation(
      conversationId,
      myId,
    );
    if (!member) throw createError(403, "Not allowed");

    const { supabase } = require("../models/supabaseClient");
    const { data: convo, error: convoErr } = await supabase
      .from("conversation")
      .select("type,cca_id")
      .eq("conversation_id", conversationId)
      .single();
    if (convoErr) throw convoErr;

    if (convo.type !== "CCA_GROUP")
      throw createError(400, "Unpin is only for CCA group chats");

    const mem = await messengerModel.userHasCcaAccess(myId, convo.cca_id);
    if (!mem || (mem.role !== "exco" && mem.role !== "teacher")) {
      throw createError(403, "Only EXCO/Teacher can unpin messages");
    }

    const out = await messengerModel.unpin(conversationId);
    res.json({ status: "ok", unpinned: out });
  } catch (err) {
    next(err);
  }
}

async function blockIfSuspended(userId) {
  const s = await messengerModel.getActiveSuspension(userId);
  if (!s) return;
  throw createError(
    403,
    `Suspended until ${new Date(s.end_at).toLocaleString()}`,
  );
}

// ------------------------
// GET /api/messenger/suspension/me
// Returns active suspension info (or null)
// ------------------------
async function getMySuspensionStatus(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    const s = await messengerModel.getActiveSuspension(myId);

    // return a consistent payload for frontend
    if (!s) {
      return res.json({ suspended: false, suspension: null });
    }

    return res.json({
      suspended: true,
      suspension: {
        suspension_id: s.suspension_id ?? s.id ?? null,
        user_id: s.user_id ?? myId,
        start_at: s.start_at ?? s.created_at ?? null,
        end_at: s.end_at ?? null,
        reason: s.reason ?? null,
        created_by: s.created_by ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function moderationInbox(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    if (!isStaff(meProfile.user_type)) throw createError(403, "Only staff");

    const cases = await messengerModel.listModerationInboxForStaff(myId, 30);
    res.json({ cases });
  } catch (err) {
    next(err);
  }
}

// POST /api/messenger/moderation/cases/:case_id/action
// { action: "dismiss"|"warn"|"delete_warn"|"suspend", note?: string }
async function moderationAction(req, res, next) {
  try {
    const me = getAuth(req);
    const myId = Number(me.id);
    const caseId = Number(req.params.case_id);
    const action = String(req.body.action || "").toLowerCase();
    const note = String(req.body.note || "").slice(0, 300);

    const meProfile = await messengerModel.getUserProfileBasic(myId);
    if (!isStaff(meProfile.user_type)) throw createError(403, "Only staff");

    const { supabase } = require("../models/supabaseClient");

    // ✅ load case + scope (DM vs CCA)
    const { data: c, error } = await supabase
      .from("moderation_case")
      .select(
        "case_id,scope,cca_id,conversation_id,message_id,reported_user_id,status",
      )
      .eq("case_id", caseId)
      .single();
    if (error) throw error;

    // ✅ allowed actions (NEW: unsuspend)
    const allowedActions = new Set([
      "dismiss",
      "warn",
      "delete_warn",
      "suspend",
      "unsuspend",
    ]);
    if (!allowedActions.has(action)) throw createError(400, "Invalid action");

    // ✅ Moderation authorization
    // - CCA cases: teacher/exco who belongs to that CCA
    // - DM cases: global moderators only (teachers)
    const scope = String(c.scope || "CCA").toUpperCase();

    if (scope === "CCA") {
      const mem = await messengerModel.userHasCcaAccess(myId, c.cca_id);
      if (!mem || (mem.role !== "teacher" && mem.role !== "exco")) {
        throw createError(403, "Not allowed");
      }
    } else if (scope === "DM") {
      const ok = await messengerModel.isGlobalModerator(myId);
      if (!ok) throw createError(403, "Not allowed");
    } else {
      throw createError(400, "Invalid moderation scope");
    }

    // Allow UNSUSPEND even if case already resolved (admin action)
    // Other actions remain OPEN-only.
    if (c.status !== "OPEN" && action !== "unsuspend") {
      return res.json({ status: "ok", note: "Already resolved", case: c });
    }

    let suspension = null;
    let warning = null;

    if (action === "dismiss") {
      const updated = await messengerModel.resolveModerationCase(
        caseId,
        "DISMISSED",
        myId,
        "DISMISS",
        note,
      );

      const updatedCase = updated || c;
      return res.json({ status: "ok", case: updatedCase, suspension: null });
    }

    if (!c.reported_user_id)
      throw createError(400, "No offender linked to this case");

    // =========================
    // ✅ NEW: UNSUSPEND / LIFT
    // =========================
    if (action === "unsuspend") {
      const ok = await messengerModel.isGlobalModerator(myId);
      if (!ok) throw createError(403, "Only teachers can lift suspension");

      const lifted = await messengerModel.liftSuspension({
        user_id: c.reported_user_id,
        lifted_by: myId,
        reason: note || "Suspension lifted by staff",
      });

      // Optional: only update case status if it was OPEN or SUSPENDED
      let updatedCase = c;
      if (
        String(c.status).toUpperCase() === "OPEN" ||
        String(c.status).toUpperCase() === "SUSPENDED"
      ) {
        updatedCase = await messengerModel.resolveModerationCase(
          caseId,
          "LIFTED",
          myId,
          "UNSUSPEND",
          note,
        );
      }

      await createNotification(
        c.reported_user_id,
        "Your suspension has been lifted by staff.",
        {
          notification_type: "SUSPENSION_LIFTED",
          conversation_id: c.conversation_id,
          metadata: { case_id: c.case_id, scope: c.scope || "CCA" },
        },
      ).catch(() => null);

      return res.json({ status: "ok", case: updatedCase, suspension: lifted });
    }

    // =========================
    // WARN / DELETE+WARN
    // =========================
    if (action === "warn" || action === "delete_warn") {
      if (action === "delete_warn") {
        await messengerModel.softDeleteMessage(c.message_id, myId);
      }

      warning = await messengerModel.issueWarning({
        user_id: c.reported_user_id,
        case_id: c.case_id,
        issued_by: myId,
        reason: note || null,
      });

      const warnCount = await messengerModel.countRecentWarnings(
        c.reported_user_id,
        30,
      );

      if (warnCount >= 2) {
        suspension = await messengerModel.suspendUser({
          user_id: c.reported_user_id,
          created_by: myId,
          reason: "Auto suspension: 2 warnings in 30 days",
          hours: 72,
        });

        await messengerModel.resolveModerationCase(
          caseId,
          "SUSPENDED",
          myId,
          "AUTO_SUSPEND",
          note,
        );
      } else {
        await messengerModel.resolveModerationCase(
          caseId,
          action === "delete_warn" ? "DELETED" : "WARNED",
          myId,
          action.toUpperCase(),
          note,
        );
      }

      await createNotification(
        c.reported_user_id,
        suspension
          ? "You have been suspended from Evently Messenger."
          : "You have received a warning from staff.",
        {
          notification_type: suspension ? "SUSPENDED" : "WARNING",
          conversation_id: c.conversation_id,
          metadata: { case_id: c.case_id, scope: c.scope || "CCA" },
        },
      ).catch(() => null);

      return res.json({ status: "ok", warning, suspension });
    }

    // =========================
    // MANUAL SUSPEND
    // =========================
    if (action === "suspend") {
      suspension = await messengerModel.suspendUser({
        user_id: c.reported_user_id,
        created_by: myId,
        reason: note || "Manual suspension",
        hours: 72,
      });

      const updated = await messengerModel.resolveModerationCase(
        caseId,
        "SUSPENDED",
        myId,
        "MANUAL_SUSPEND",
        note,
      );

      await createNotification(
        c.reported_user_id,
        "You have been suspended from Evently Messenger.",
        {
          notification_type: "SUSPENDED",
          conversation_id: c.conversation_id,
          metadata: { case_id: c.case_id, scope: c.scope || "CCA" },
        },
      ).catch(() => null);

      return res.json({ status: "ok", case: updated, suspension });
    }

    throw createError(400, "Invalid action");
  } catch (err) {
    next(err);
  }
}

export {
  listConversations,
  openCcaGroup,
  openDm,
  getMessages,
  sendMessage,
  markRead,
  searchMessages,
  softDeleteMessage,
  pinMessage,
  getPinned,
  unpinMessage,
  reportMessage,
  searchUsersForDm,

  createDmRequest,
  listDmRequestsInbox,
  respondDmRequest,
  moderationInbox,
  moderationAction,
  getMySuspensionStatus,
};
