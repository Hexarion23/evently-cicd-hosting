// ============================
// WAITLIST ADMIN PANEL (EXCO)
// ============================

let currentUser = null;
let excoCcaIds = [];
let selectedEventId = null;
let currentEvent = null;
let waitlistRealtimeChannel = null;

// DOM refs
const notExcoAlert = document.getElementById("notExcoAlert");
const adminContent = document.getElementById("waitlistAdminContent");
const eventSelect = document.getElementById("eventSelect");
const refreshBtn = document.getElementById("refreshWaitlistBtn");
const clearExpiredBtn = document.getElementById("clearExpiredBtn");
const tableBody = document.getElementById("waitlistTableBody");
const waitlistMeta = document.getElementById("waitlistMeta");
const emptyState = document.getElementById("waitlistEmptyState");

// ------------- Helpers -------------

function showToastSafe(title, message, type = "info") {
  if (typeof showToast === "function") {
    showToast(title, message, type);
  } else {
    console.log(`[${type}] ${title}: ${message}`);
  }
}

function formatDateTime(dt) {
  if (!dt) return "—";

  // Force UTC if Supabase returns timestamp without timezone
  const iso = dt.endsWith("Z") ? dt : dt + "Z";

  return new Date(iso).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function formatTimeLeftMs(ms) {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function derivePromotionStatus(entry) {
  const now = new Date();

  if (!entry.promotion_offered)
    return { label: "Waiting", badgeClass: "bg-secondary", timeLeftText: "—" };

  if (entry.promoted_at)
    return { label: "Claimed", badgeClass: "bg-primary", timeLeftText: "Claimed" };

  if (entry.promotion_expires_at) {
    const diff = new Date(entry.promotion_expires_at) - now;

    if (diff <= 0)
      return {
        label: "Promotion Expired",
        badgeClass: "bg-danger",
        timeLeftText: "Expired",
      };

    return {
      label: "Promotion Active",
      badgeClass: "bg-success",
      timeLeftText: formatTimeLeftMs(diff),
    };
  }

  return { label: "Promoted", badgeClass: "bg-success", timeLeftText: "—" };
}

// ------------- Auth + Init -------------

async function fetchCurrentUserBackend() {
  try {
    const res = await fetch("/api/auth/me", { method: "GET", credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.user;
  } catch (err) {
    console.error("Error fetching current user:", err);
    return null;
  }
}

async function initWaitlistAdmin() {
  currentUser = await fetchCurrentUserBackend();

  if (!currentUser || currentUser.role !== "exco") {
    notExcoAlert.classList.remove("d-none");
    adminContent.classList.add("d-none");
    return;
  }

  notExcoAlert.classList.add("d-none");
  adminContent.classList.remove("d-none");

  await loadExcoCcasAndEvents();
  setupEventListeners();
}

document.addEventListener("DOMContentLoaded", initWaitlistAdmin);

// ------------- Load EXCO CCAs + Events -------------

async function loadExcoCcasAndEvents() {
  try {
    const { data: memberships } = await supabase
      .from("cca_membership")
      .select("cca_id, role")
      .eq("user_id", currentUser.id); // ✅ matches event-details.js + your auth payload


    excoCcaIds =
      memberships?.filter((m) =>
        m.role ? m.role.toLowerCase().includes("exco") : false
      ).map((m) => m.cca_id) || [];

    if (excoCcaIds.length === 0) {
      eventSelect.innerHTML = '<option value="">No events available</option>';
      return;
    }

    const nowIso = new Date().toISOString();

const { data: events } = await supabase
  .from("event")
  .select("*")
  .in("cca_id", excoCcaIds)
  .or(`sign_up_deadline.is.null,sign_up_deadline.gt.${nowIso}`)
  .order("start_datetime", { ascending: false });


    eventSelect.innerHTML =
      '<option value="">-- Choose an event --</option>' +
      events
        .map(
          (ev) => `
        <option value="${ev.event_id}">
          ${ev.title} (${new Date(ev.start_datetime).toLocaleDateString("en-SG")})
        </option>`
        )
        .join("");

  } catch (err) {
    console.error("loadExcoCcasAndEvents error:", err);
  }
}

// ------------- Event Listeners -------------

function setupEventListeners() {
  eventSelect?.addEventListener("change", async (e) => {
    const val = e.target.value;
    if (!val) {
      selectedEventId = null;
      clearWaitlistTable();
      return;
    }

    selectedEventId = parseInt(val, 10);
    await loadEventMeta();
    await subscribeRealtimeForEvent(selectedEventId);
    await loadWaitlistForSelectedEvent();
  });

  refreshBtn?.addEventListener("click", async () => {
    if (!selectedEventId) {
      showToastSafe("Info", "Please select an event.");
      return;
    }
    await loadWaitlistForSelectedEvent();
  });

  clearExpiredBtn?.addEventListener("click", async () => {
    if (!selectedEventId) return;
    await clearExpiredPromotionsBackend(selectedEventId);
  });
}

// ------------- Load Event Meta -------------

async function loadEventMeta() {
  if (!selectedEventId) return;

  const { data: ev } = await supabase
    .from("event")
    .select("*")
    .eq("event_id", selectedEventId)
    .single();

  currentEvent = ev;

  const { count } = await supabase
    .from("event_signup")
    .select("*", { count: "exact", head: true })
    .eq("event_id", selectedEventId);

  waitlistMeta.textContent = `Capacity: ${ev.capacity} | Signed up: ${count} | Remaining: ${
    ev.capacity - count
  }`;
}

// ------------- Load Waitlist -------------

async function loadWaitlistForSelectedEvent() {
  if (!selectedEventId) return;

  const { data: entries } = await supabase
    .from("event_waitlist")
    .select("*")
    .eq("event_id", selectedEventId)
    .order("joined_at");

  if (!entries || entries.length === 0) {
    renderWaitlist([], {});
    return;
  }

  const userIds = [...new Set(entries.map((e) => e.user_id))];

  const { data: users } = await supabase
    .from("User")
    .select("user_id, name, email")
    .in("user_id", userIds);

  const userMap = {};
  users?.forEach((u) => (userMap[u.user_id] = u));

  renderWaitlist(entries, userMap);
}

function clearWaitlistTable() {
  tableBody.innerHTML = `
    <tr><td colspan="7" class="text-center text-muted">Select an event.</td></tr>`;
  emptyState.classList.add("d-none");
}

// ------------- Render Waitlist -------------

function renderWaitlist(entries, userMap) {
  if (!entries.length) {
    emptyState.classList.remove("d-none");
    tableBody.innerHTML = "";
    return;
  }

  emptyState.classList.add("d-none");

  tableBody.innerHTML = entries
    .map((e, idx) => {
      const user = userMap[e.user_id] || {};
      const status = derivePromotionStatus(e);

      const canPromote = !e.promotion_offered;

      return `
      <tr data-waitlist-id="${e.waitlist_id}" data-user-id="${e.user_id}">
        <td>${idx + 1}</td>
        <td>${user.name || "Unknown"}</td>
        <td>${user.email || "—"}</td>
        <td>${formatDateTime(e.joined_at)}</td>
        <td><span class="badge ${status.badgeClass}">${status.label}</span></td>
        <td>${status.timeLeftText}</td>

        <td class="text-end">
          <button class="btn btn-sm btn-success btn-promote" ${canPromote ? "" : "disabled"}>
            Promote
          </button>
          <button class="btn btn-sm btn-outline-danger btn-remove">Remove</button>
        </td>
      </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-promote").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const tr = e.target.closest("tr");
      const waitlistId = tr.dataset.waitlistId;
      await handleManualPromoteBackend(waitlistId);
    })
  );

  tableBody.querySelectorAll(".btn-remove").forEach((btn) =>
  btn.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    const waitlistId = tr.dataset.waitlistId;
    const userId = tr.dataset.userId;     // 🔥 REQUIRED
    await handleRemoveBackend(waitlistId, userId);
  })
);
}

// ------------- Backend actions -------------

async function handleManualPromoteBackend(waitlistId) {
  if (!confirm("Offer promotion to this user?")) return;

  const res = await fetch("/api/waitlist/promote-manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waitlistId, eventId: selectedEventId }),
  });

  const json = await res.json();
  showToastSafe("Promotion", json.message, "success");

  await loadWaitlistForSelectedEvent();
}

async function handleRemoveBackend(waitlistId, userId) {
  if (!confirm("Remove this user from waitlist?")) return;

  const res = await fetch("/api/waitlist/cancel", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // 🔥 REQUIRED FOR JWT COOKIE
  body: JSON.stringify({
    event_id: selectedEventId,
    user_id: userId,
  }),
});



  const json = await res.json();

  if (!res.ok) {
    showToastSafe("Error", json.error || "Failed to remove user", "danger");
    return;
  }

  showToastSafe("Removed", json.message, "warning");
  await loadWaitlistForSelectedEvent();
}



async function clearExpiredPromotionsBackend(eventId) {
  const res = await fetch("/api/waitlist/clear-expired", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId }),
  });

  const json = await res.json();
  showToastSafe("Expired Promotions", json.message, "info");

  await loadWaitlistForSelectedEvent();
}

// ------------- Realtime -------------

async function subscribeRealtimeForEvent(eventId) {
  if (waitlistRealtimeChannel) {
    await supabase.removeChannel(waitlistRealtimeChannel);
  }

  waitlistRealtimeChannel = supabase
    .channel(`waitlist_admin_${eventId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_waitlist",
        filter: `event_id=eq.${eventId}`,
      },
      async () => {
        await loadWaitlistForSelectedEvent();
      }
    )
    .subscribe((status) => console.log("Realtime:", status));
}


