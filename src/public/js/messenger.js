// ===============================
// Evently Messenger Frontend
// ===============================
let myUserId = null;
let activeConversationId = null;
let oldestLoadedTs = null;
let myUserType = null;
let pinnedMessageId = null;

let __openActionForMid = null;
let __actionMenuEl = null;
let __actionMenuBackdropEl = null;

const $ = (id) => document.getElementById(id);

function isStaffType(t) {
  const x = String(t || "")
    .trim()
    .toLowerCase();
  return x === "teacher" || x === "exco";
}

function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDbTime(ts) {
  // If it already has timezone info (Z or +08:00), Date can parse correctly.
  const s = String(ts || "").trim();
  if (!s) return null;

  const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(s);
  if (hasTz) return new Date(s);

  // Supabase/Postgres "timestamp without time zone" often comes like:
  // "2026-02-18 09:08:41.57"
  // Treat it as UTC by converting to ISO + 'Z'
  const isoUtc = s.replace(" ", "T") + "Z";
  return new Date(isoUtc);
}

function fmtTime(ts) {
  const d = parseDbTime(ts);
  if (!d || isNaN(d.getTime())) return "";

  const now = new Date();

  const sameDay = d.toDateString() === now.toDateString();
  const yday = new Date(now);
  yday.setDate(now.getDate() - 1);

  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "pm" : "am";

  if (sameDay) return `Today ${hh}:${mm}${ampm}`;
  if (d.toDateString() === yday.toDateString())
    return `Yesterday ${hh}:${mm}${ampm}`;
  return `${d.toLocaleDateString()} ${hh}:${mm}${ampm}`;
}


async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || data.message || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function loadMe() {
  const data = await api("/api/auth/me");
  const u = data.user || {};

  myUserId = Number(u.id ?? u.user_id);

  const rawType = u.user_type ?? u.role ?? u.userType ?? "";
  myUserType = String(rawType).trim().toLowerCase();

  console.log("[Messenger] me:", { myUserId, myUserType, rawType });

  // 🔒 Check suspension status (if endpoint exists)
  try {
    const s = await api("/api/messenger/suspension/me");
    const suspended = Boolean(s?.suspended);
    const until = s?.suspension?.end_at || null;

    if (suspended) {
      const input = $("messageInput");
      const sendBtn = $("sendBtn");

      if (input) {
        input.disabled = true;
        input.placeholder = until
          ? `Suspended until ${new Date(until).toLocaleString()}`
          : "You are suspended from messaging";
        input.style.cursor = "not-allowed";
        input.style.opacity = "0.6";
      }

      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
        sendBtn.style.cursor = "not-allowed";
      }
    }
  } catch (e) {
    console.warn("[Messenger] Suspension check failed", e);
  }
}

function renderConversationItem(c) {
  const last = c.last_message
    ? escapeHtml(c.last_message.content).slice(0, 45)
    : "No messages yet";
  const ts = c.last_message?.created_at
    ? fmtTime(c.last_message.created_at)
    : "";
  const unread = c.unread > 0 ? `<span class="msgr-unread">${c.unread}</span>` : "";

  return `
    <div class="msgr-item" data-id="${c.conversation_id}">
      <div class="msgr-title">${escapeHtml(c.title)}</div>
      <div style="font-size:12px;opacity:.85;margin-top:4px">${last}</div>
      <div class="msgr-meta">
        <span>${ts}</span>
        ${unread}
      </div>
    </div>
  `;
}

async function loadConversations() {
  const data = await api("/api/messenger/conversations");
  window.__convos = data.conversations || [];

  const q = $("convSearch").value.trim().toLowerCase();
  const filtered = q
    ? window.__convos.filter((c) => c.title.toLowerCase().includes(q))
    : window.__convos;

  $("conversationList").innerHTML = filtered
    .map(renderConversationItem)
    .join("");

  document.querySelectorAll(".msgr-item").forEach((el) => {
    el.addEventListener("click", () => openConversation(Number(el.dataset.id)));
  });
}

/**
 * ⭐ New message row structure:
 * - msg-row wraps the bubble
 * - kebab button is a small floating control (shows on hover)
 * - NO per-message menu HTML (we use a global portal menu)
 */
function renderMessage(m) {
  const time = fmtTime(m.created_at);

  // Deleted
  if (m.deleted_at) {
    return `
      <div class="msg-row msg-row-sys">
        <div class="bubble sys msg-bubble-sys">Message deleted</div>
      </div>
    `;
  }

  const content = escapeHtml(m.content);

  // System
  if (m.is_system) {
    return `
      <div class="msg-row msg-row-sys">
        <div class="bubble sys msg-bubble-sys">
          ${content}
          <div class="msg-time">${time}</div>
        </div>
      </div>
    `;
  }

  const isMe = Number(m.sender_id) === myUserId;
  const rowCls = isMe ? "msg-row me-row" : "msg-row them-row";
  const bubbleCls = isMe ? "bubble me msg-bubble" : "bubble them msg-bubble";

  const senderName = !isMe ? escapeHtml(m.sender?.name || "Unknown") : "";

  const canPin = isStaffType(myUserType);
  const isPinned =
    pinnedMessageId && Number(m.message_id) === Number(pinnedMessageId);

  // encode state into data attrs so menu can be built without storing huge objects
  const dataAttrs = [
    `data-mid="${m.message_id}"`,
    `data-is-me="${isMe ? "1" : "0"}"`,
    `data-can-pin="${canPin ? "1" : "0"}"`,
    `data-is-pinned="${isPinned ? "1" : "0"}"`,
  ].join(" ");

  return `
    <div class="${rowCls}">
      <div class="${bubbleCls} msg-bubble" ${dataAttrs}>
        ${!isMe ? `<div class="msg-sender"><b>${senderName}</b></div>` : ""}
        <div class="msg-text">${content}</div>
        <div class="msg-time">${time}</div>

        <button class="msg-kebab" type="button" aria-label="Message actions" title="Actions">
          <span class="kebab-dot"></span>
          <span class="kebab-dot"></span>
          <span class="kebab-dot"></span>
        </button>
      </div>
    </div>
  `;
}

async function loadPinned(conversationId) {
  const data = await api(`/api/messenger/conversations/${conversationId}/pin`);
  const pinned = data.pinned;

  pinnedMessageId = pinned?.message?.message_id ?? null;

  if (!pinned || !pinned.message) {
    $("pinBox").style.display = "none";
    $("pinBox").innerHTML = "";
    return;
  }

  $("pinBox").style.display = "block";
  $("pinBox").innerHTML =
    `📌 <b>Pinned:</b> ${escapeHtml(pinned.message.content)}
     <span style="opacity:.7">(${fmtTime(pinned.message.created_at)})</span>`;
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  oldestLoadedTs = null;

  const convo = (window.__convos || []).find(
    (c) => c.conversation_id === conversationId,
  );
  $("activeTitle").textContent = convo ? convo.title : "Chat";
  $("activeSubtitle").textContent = convo ? convo.type : "";

  $("messages").innerHTML = "";
  closeActionMenu();

  await loadPinned(conversationId);
  await loadMessages(conversationId, 30, null, true);

  await api(`/api/messenger/conversations/${conversationId}/read`, {
    method: "POST",
    body: "{}",
  });

  await loadConversations();
}

async function loadMessages(
  conversationId,
  limit = 30,
  before = null,
  initial = false,
) {
  const container = $("messages");

  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (before) qs.set("before", before);

  const data = await api(
    `/api/messenger/conversations/${conversationId}/messages?` + qs.toString(),
  );
  const msgs = data.messages || [];

  if (msgs.length > 0) oldestLoadedTs = msgs[0].created_at;

  const html = msgs.map(renderMessage).join("");

  if (initial) {
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  } else {
    const prevHeight = container.scrollHeight;
    container.innerHTML = html + container.innerHTML;
    container.scrollTop = container.scrollHeight - prevHeight;
  }

  closeActionMenu(); // if DOM changed, close cleanly
}

async function send() {
  if (!activeConversationId) return alert("Select a conversation first");

  const input = $("messageInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  try {
    await api(`/api/messenger/conversations/${activeConversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });

    await loadMessages(activeConversationId, 30, null, true);
    await loadConversations();
  } catch (e) {
    alert(e.message);
  }
}

async function searchInConversation() {
  if (!activeConversationId) return;

  const q = $("msgSearch").value.trim();
  if (!q) return;

  const data = await api(
    `/api/messenger/conversations/${activeConversationId}/search?q=${encodeURIComponent(q)}`,
  );
  const matches = data.matches || [];

  if (matches.length === 0) {
    alert("No matches found");
    return;
  }

  const top = matches
    .slice(0, 5)
    .map((m) => `• ${m.content.slice(0, 60)} (${fmtTime(m.created_at)})`)
    .join("\n");
  alert(
    `Matches:\n${top}\n\n(For full jump-to-message, we can implement jump-to-message next.)`,
  );
}

async function startDmFlow() {
  const q = $("dmSearch").value.trim();
  if (!q) return;

  const data = await api(
    `/api/messenger/users/search?q=${encodeURIComponent(q)}`,
  );
  const users = data.users || [];

  if (users.length === 0) {
    $("dmResults").innerHTML =
      `<div style="opacity:.7">No eligible users found.</div>`;
    return;
  }

  $("dmResults").innerHTML = users
    .map(
      (u) => `
    <div style="padding:6px 0; border-bottom:1px solid #3332; cursor:pointer"
         data-uid="${u.user_id}">
      <b>${escapeHtml(u.name)}</b>
      <div style="opacity:.7">${escapeHtml(u.email)} (${escapeHtml(u.user_type)})</div>
    </div>
  `,
    )
    .join("");

  document.querySelectorAll("#dmResults [data-uid]").forEach((el) => {
    el.addEventListener("click", async () => {
      const targetUserId = Number(el.dataset.uid);

      try {
        const open = await api("/api/messenger/dm/open", {
          method: "POST",
          body: JSON.stringify({ targetUserId }),
        });

        if (open?.status === "pending") {
          alert("DM request sent. Waiting for approval.");
          $("dmResults").innerHTML = "";
          $("dmSearch").value = "";
          return;
        }

        const convoId =
          open?.conversation?.conversation_id ?? open?.conversation_id;
        if (!convoId)
          throw new Error("DM opened but no conversation_id returned");

        await loadConversations();
        await openConversation(Number(convoId));

        $("dmResults").innerHTML = "";
        $("dmSearch").value = "";
        return;
      } catch (e) {
        if (e.status === 409 && e.data?.needsApproval) {
          const note =
            prompt(
              "This EXCO/Teacher requires approval. Add a short reason (optional):",
            ) || "";

          await api("/api/messenger/dm/request", {
            method: "POST",
            body: JSON.stringify({ targetUserId, message: note }),
          });

          alert("DM request sent! Wait for approval.");
          $("dmResults").innerHTML = "";
          $("dmSearch").value = "";
          return;
        }

        alert(e.message || "Request failed");
      }
    });
  });
}

function renderDmRequest(r) {
  const who = escapeHtml(r.requester?.name || "Unknown");
  const when = fmtTime(r.created_at);
  const msg = r.message
    ? escapeHtml(r.message)
    : "<span style='opacity:.7'>No message</span>";

  return `
    <div class="req-item" data-rid="${r.request_id}">
      <div><b>${who}</b> <span style="opacity:.7">(${when})</span></div>
      <div style="margin-top:4px;font-size:12px">${msg}</div>
      <div class="req-actions">
        <button class="smallbtn btn-ok" data-act="approve">Approve</button>
        <button class="smallbtn btn-bad" data-act="reject">Reject</button>
      </div>
    </div>
  `;
}

async function loadDmRequestsInbox() {
  if (!isStaffType(myUserType)) return;

  $("dmRequestsWrap").style.display = "block";
  $("dmRequestsPanel").innerHTML = `<div class="muted">Loading...</div>`;

  const data = await api("/api/messenger/dm/requests/inbox");
  const reqs = data.requests || [];

  if (reqs.length === 0) {
    $("dmRequestsPanel").innerHTML =
      `<div class="muted">No pending requests.</div>`;
    return;
  }

  $("dmRequestsPanel").innerHTML = reqs.map(renderDmRequest).join("");

  document.querySelectorAll("#dmRequestsPanel [data-rid]").forEach((card) => {
    const requestId = Number(card.dataset.rid);

    card.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.act;

        const resp = await api(
          `/api/messenger/dm/requests/${requestId}/respond`,
          {
            method: "POST",
            body: JSON.stringify({ action }),
          },
        );

        alert(action === "approve" ? "Approved ✅" : "Rejected ❌");

        if (action === "approve" && resp.conversation?.conversation_id) {
          await loadConversations();
          await openConversation(resp.conversation.conversation_id);
        }

        await loadDmRequestsInbox();
      });
    });
  });
}

async function loadModerationInbox() {
  if (!isStaffType(myUserType)) return;

  $("modWrap").style.display = "block";
  $("modPanel").innerHTML = `<div class="muted">Loading...</div>`;

  let data;
  try {
    data = await api("/api/messenger/moderation/inbox");
  } catch (e) {
    $("modPanel").innerHTML =
      `<div class="muted">Failed to load moderation inbox.</div>`;
    return;
  }

  const cases = data.cases || [];

  if (cases.length === 0) {
    $("modPanel").innerHTML = `<div class="muted">No open cases.</div>`;
    return;
  }

  function safeMsgText(c) {
    const ev = c.evidence || c.message || c.reported_message || null;

    const raw = ev?.deleted_at
      ? "[Message deleted]"
      : (ev?.content ?? ev?.message?.content ?? "");
    const txt = String(raw || "").trim();
    if (!txt)
      return "<span style='opacity:.7'>No message content available</span>";
    return escapeHtml(txt);
  }

  function safeMsgMeta(c) {
    const ev = c.evidence || c.message || c.reported_message || null;
    const when = ev?.created_at ? fmtTime(ev.created_at) : "";
    const who = ev?.sender?.name ? escapeHtml(ev.sender.name) : null;

    if (!when && !who) return "";
    if (who && when)
      return `<span style="opacity:.75;">${who} · ${when}</span>`;
    return `<span style="opacity:.75;">${who || when}</span>`;
  }

  function safeContextTitle(c, scope) {
    const convo = c.conversation || c.convo || null;
    if (scope === "DM") return escapeHtml(convo?.title || "Direct Message");
    return escapeHtml(
      convo?.title ||
        c.conversation_title ||
        c.cca_title ||
        c.cca_name ||
        "CCA Chat",
    );
  }

  function statusBadge(status) {
    const s = String(status || "OPEN").toUpperCase();

    const badge = (text, bg, fg) =>
      `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:${bg}; color:${fg}; font-weight:800;">${text}</span>`;

    if (s === "SUSPENDED") return badge("SUSPENDED", "#fee2e2", "#991b1b");
    if (s === "WARNED") return badge("WARNED", "#fef9c3", "#854d0e");
    if (s === "DELETED") return badge("DELETED", "#e0e7ff", "#3730a3");
    if (s === "DISMISSED") return badge("DISMISSED", "#f3f4f6", "#374151");
    if (s === "LIFTED") return badge("LIFTED", "#dcfce7", "#166534");

    return badge("OPEN", "#dcfce7", "#166534");
  }

  $("modPanel").innerHTML = cases
    .map((c) => {
      const reporter = c.reporter?.name || "Unknown";
      const offender = c.offender?.name || "Unknown";
      const reason = c.report?.reason
        ? escapeHtml(c.report.reason)
        : "No reason";

      const scope = String(c.scope || "CCA").toUpperCase();
      const scopeBadge =
        scope === "DM"
          ? `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#eef2ff; color:#3730a3; font-weight:700;">DM</span>`
          : `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#ecfeff; color:#155e75; font-weight:700;">CCA</span>`;

      const contextTitle = safeContextTitle(c, scope);
      const createdAt = c.created_at ? fmtTime(c.created_at) : "";
      const subline = createdAt
        ? ` · <span style="opacity:.7">${createdAt}</span>`
        : "";

      const evidenceText = safeMsgText(c);
      const evidenceMeta = safeMsgMeta(c);

      const st = String(c.status || "OPEN").toUpperCase();

      const actionButtons =
        st === "SUSPENDED"
          ? `<button class="smallbtn" data-mod="unsuspend" data-cid="${c.case_id}">Lift Suspension</button>`
          : `
            <button class="smallbtn" data-mod="dismiss" data-cid="${c.case_id}">Dismiss</button>
            <button class="smallbtn" data-mod="warn" data-cid="${c.case_id}">Warn</button>
            <button class="smallbtn" data-mod="delete_warn" data-cid="${c.case_id}">Delete+Warn</button>
            <button class="smallbtn" data-mod="suspend" data-cid="${c.case_id}">Suspend</button>
          `;

      return `
        <div style="padding:10px; border-radius:12px; background:white; border:1px solid #eee; margin-bottom:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="font-weight:700; color:#111827; font-size:13px;">
              ${escapeHtml(offender)}
              <span style="font-weight:500; opacity:.7;">reported by ${escapeHtml(reporter)}${subline}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${scopeBadge}
              ${statusBadge(st)}
            </div>
          </div>

          <div style="margin-top:6px; font-size:12px; opacity:.85;">
            <b style="opacity:.8;">Context:</b> ${contextTitle}
          </div>

          <div style="margin-top:8px; padding:8px; border-radius:10px; background:#f9fafb; border:1px solid #eef2f7;">
            <div style="font-size:12px; font-weight:700; color:#111827; display:flex; justify-content:space-between; gap:10px;">
              <span>Reported Message</span>
              ${evidenceMeta ? `<span style="font-weight:600;">${evidenceMeta}</span>` : ""}
            </div>
            <div style="margin-top:6px; font-size:12px; color:#111827; line-height:1.35;">
              ${evidenceText}
            </div>
          </div>

          <div style="opacity:.85; margin-top:8px; font-size:12px;">
            <b style="opacity:.8;">Reason:</b> ${reason}
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
            ${actionButtons}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("#modPanel button[data-mod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = String(btn.dataset.mod || "").toLowerCase();
      const caseId = Number(btn.dataset.cid);

      const note = prompt("Optional note (shown in case record):") || "";

      try {
        const resp = await api(
          `/api/messenger/moderation/cases/${caseId}/action`,
          {
            method: "POST",
            body: JSON.stringify({ action, note }),
          },
        );

        // ✅ Only "unsuspend" should look for resp.lifted
        if (action === "unsuspend") {
          // backend returns: { status:"ok", case:..., suspension: { lifted:true/false, ... } }
          const result = resp?.suspension || resp;
          const lifted = Boolean(result?.lifted);

          if (lifted) {
            const count = result?.count ? ` (${result.count})` : "";
            alert(`Suspension lifted ✅${count}`);
          } else {
            alert(result?.reason || "No active suspension found.");
          }
        } else {
          alert("Action applied ✅");
        }

        await loadModerationInbox();
      } catch (e) {
        alert(e.message || "Action failed");
      }
    });
  });
}

// ===============================
// ⭐ GLOBAL ACTION MENU (PORTAL)
// ===============================
function ensureActionMenu() {
  if (__actionMenuEl && __actionMenuBackdropEl) return;

  __actionMenuBackdropEl = document.createElement("div");
  __actionMenuBackdropEl.id = "msgActionBackdrop";
  __actionMenuBackdropEl.className = "msg-action-backdrop hidden";

  __actionMenuEl = document.createElement("div");
  __actionMenuEl.id = "msgActionMenu";
  __actionMenuEl.className = "msg-action-menu hidden";
  __actionMenuEl.setAttribute("role", "menu");
  __actionMenuEl.innerHTML = `
    <button type="button" class="msg-action-item" data-action="pin">
      <span class="msg-action-ic">📌</span><span class="msg-action-txt">Pin</span>
    </button>
    <button type="button" class="msg-action-item" data-action="unpin">
      <span class="msg-action-ic">📌</span><span class="msg-action-txt">Unpin</span>
    </button>
    <div class="msg-action-divider"></div>
    <button type="button" class="msg-action-item" data-action="report">
      <span class="msg-action-ic">🚩</span><span class="msg-action-txt">Report</span>
    </button>
    <button type="button" class="msg-action-item danger" data-action="delete">
      <span class="msg-action-ic">🗑️</span><span class="msg-action-txt">Delete</span>
    </button>
  `;

  document.body.appendChild(__actionMenuBackdropEl);
  document.body.appendChild(__actionMenuEl);

  __actionMenuBackdropEl.addEventListener("click", closeActionMenu);

  __actionMenuEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const mid = Number(__openActionForMid);
    if (!mid || !activeConversationId) return;

    closeActionMenu();

    try {
      if (action === "pin") {
        await api(`/api/messenger/messages/${mid}/pin`, {
          method: "POST",
          body: "{}",
        });
        await loadPinned(activeConversationId);
        await loadMessages(activeConversationId, 30, null, true);
      }

      if (action === "unpin") {
        await api(`/api/messenger/conversations/${activeConversationId}/pin`, {
          method: "DELETE",
        });
        await loadPinned(activeConversationId);
        await loadMessages(activeConversationId, 30, null, true);
      }

      if (action === "report") {
        const reason = prompt("Report reason (optional, max 200 chars):") || "";
        await api(`/api/messenger/messages/${mid}/report`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        alert("Reported ✅");
      }

      if (action === "delete") {
        if (!confirm("Delete this message?")) return;
        await api(`/api/messenger/messages/${mid}/delete`, {
          method: "POST",
          body: "{}",
        });
        await loadMessages(activeConversationId, 30, null, true);
        alert("Deleted ✅");
      }
    } catch (err) {
      alert(err.message || "Action failed");
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeActionMenu();
  });

  // Close on scroll/resize (prevents “menu floating in wrong place”)
  window.addEventListener("resize", closeActionMenu);
  const msgs = $("messages");
  if (msgs) msgs.addEventListener("scroll", closeActionMenu, { passive: true });
}

function closeActionMenu() {
  __openActionForMid = null;
  if (__actionMenuEl) __actionMenuEl.classList.add("hidden");
  if (__actionMenuBackdropEl) __actionMenuBackdropEl.classList.add("hidden");
}

function openActionMenuForBubble(bubbleEl, anchorEl) {
  ensureActionMenu();

  const mid = Number(bubbleEl.dataset.mid);
  const isMe = bubbleEl.dataset.isMe === "1";
  const canPin = bubbleEl.dataset.canPin === "1";
  const isPinned = bubbleEl.dataset.isPinned === "1";

  __openActionForMid = mid;

  // Toggle visibility of items
  const pinBtn = __actionMenuEl.querySelector('[data-action="pin"]');
  const unpinBtn = __actionMenuEl.querySelector('[data-action="unpin"]');
  const deleteBtn = __actionMenuEl.querySelector('[data-action="delete"]');

  if (pinBtn) pinBtn.style.display = canPin && !isPinned ? "flex" : "none";
  if (unpinBtn) unpinBtn.style.display = canPin && isPinned ? "flex" : "none";
  if (deleteBtn) deleteBtn.style.display = isMe ? "flex" : "none";

  // Position
  const rect = anchorEl.getBoundingClientRect();
  __actionMenuEl.classList.remove("hidden");
  __actionMenuBackdropEl.classList.remove("hidden");

  // Default position: below-right of button
  let left = rect.right - 6;
  let top = rect.bottom + 10;

  // Temporarily set to measure
  __actionMenuEl.style.left = "0px";
  __actionMenuEl.style.top = "0px";
  __actionMenuEl.style.transform = "translate(0,0)";

  const menuRect = __actionMenuEl.getBoundingClientRect();
  const pad = 12;

  // If overflowing right, shift left
  if (left + menuRect.width > window.innerWidth - pad) {
    left = rect.left - menuRect.width + 6;
  }

  // If overflowing bottom, open above
  if (top + menuRect.height > window.innerHeight - pad) {
    top = rect.top - menuRect.height - 10;
  }

  // Clamp
  left = Math.max(
    pad,
    Math.min(left, window.innerWidth - menuRect.width - pad),
  );
  top = Math.max(
    pad,
    Math.min(top, window.innerHeight - menuRect.height - pad),
  );

  __actionMenuEl.style.left = `${left}px`;
  __actionMenuEl.style.top = `${top}px`;

  // small “pop” animation
  __actionMenuEl.classList.add("pop");
  setTimeout(
    () => __actionMenuEl && __actionMenuEl.classList.remove("pop"),
    160,
  );
}

async function init() {
  await loadMe();

  await loadModerationInbox();

  const refreshModBtn = $("refreshModBtn");
  if (refreshModBtn)
    refreshModBtn.addEventListener("click", loadModerationInbox);

  await loadDmRequestsInbox();

  const refreshRequestsBtn = $("refreshRequestsBtn");
  if (refreshRequestsBtn)
    refreshRequestsBtn.addEventListener("click", loadDmRequestsInbox);

  const convSearch = $("convSearch");
  if (convSearch) convSearch.addEventListener("input", loadConversations);

  const dmSearchBtn = $("dmSearchBtn");
  if (dmSearchBtn) dmSearchBtn.addEventListener("click", startDmFlow);

  const dmSearch = $("dmSearch");
  if (dmSearch) {
    dmSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") startDmFlow();
    });
  }

  const sendBtn = $("sendBtn");
  if (sendBtn) sendBtn.addEventListener("click", send);

  const messageInput = $("messageInput");
  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
  }

  const loadOlderBtn = $("loadOlderBtn");
  if (loadOlderBtn) {
    loadOlderBtn.addEventListener("click", async () => {
      if (!activeConversationId) return;
      if (!oldestLoadedTs) return;
      await loadMessages(activeConversationId, 30, oldestLoadedTs, false);
    });
  }

  const msgSearchBtn = $("msgSearchBtn");
  if (msgSearchBtn)
    msgSearchBtn.addEventListener("click", searchInConversation);

  // ✅ Global portal menu init
  ensureActionMenu();

  // ✅ Message actions: open global menu
  const messagesEl = $("messages");
  if (messagesEl) {
    messagesEl.addEventListener("click", (e) => {
      const kebab = e.target.closest(".msg-kebab");
      if (!kebab) return;

      const bubble = kebab.closest(".msg-bubble");
      if (!bubble) return;

      e.preventDefault();
      e.stopPropagation();

      // If clicking same message twice -> toggle close
      const mid = Number(bubble.dataset.mid);
      if (
        __openActionForMid &&
        Number(__openActionForMid) === mid &&
        __actionMenuEl &&
        !__actionMenuEl.classList.contains("hidden")
      ) {
        closeActionMenu();
        return;
      }

      openActionMenuForBubble(bubble, kebab);
    });
  }

  // Close menu on outside click
  document.addEventListener("click", (e) => {
    if (e.target.closest("#msgActionMenu")) return;
    if (e.target.closest(".msg-kebab")) return;
    closeActionMenu();
  });

  await loadConversations();

  // deep-link ?c=ID
  const url = new URL(window.location.href);
  const c = url.searchParams.get("c");
  if (c) await openConversation(Number(c));
}

init().catch((err) => {
  console.error(err);
  alert(err.message || "Failed to load messenger");
});
