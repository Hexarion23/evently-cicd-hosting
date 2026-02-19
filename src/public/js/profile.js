// ===============================
// profile.js — real data version
// ===============================

import { supabase } from "./data.js";

let currentDeleteId = null;
let currentUserForDelete = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Get full user profile from backend
    const res = await fetch("/api/auth/profile", { credentials: "include" });

    if (!res.ok) {
      console.error("Not authenticated, redirecting to login.");
      window.location.href = "login.html";
      return;
    }

    const { user } = await res.json();

    // 1) Header profile info
    renderProfile(user);

    // 2) Stats + Recent Activity from Supabase
    await loadProfileStats(user.user_id);

    // 3) EXCO: events they manage
    await renderManagedEvents(user);

    // 4) Buttons (Student / Exco view)
    updateRoleButtons(user);
    setupRoleSwitchers(user);

    // 5) Delete confirmation (EXCO)
    const confirmBtn = document.getElementById("confirmDeleteBtn");
    if (confirmBtn) confirmBtn.addEventListener("click", confirmDelete);
  } catch (err) {
    console.error("Failed to initialise profile page:", err);
  }
});

// -----------------------------------------
// STUDENT / EXCO VIEW BUTTONS
// -----------------------------------------
function setupRoleSwitchers(user) {
  const studentBtn = document.getElementById("switchToStudent");
  const excoBtn = document.getElementById("switchToExco");
  const managedSection = document.getElementById("managedEventsSection");

  if (!studentBtn || !excoBtn) return;

  // Student View: just hide EXCO section visually
  studentBtn.addEventListener("click", () => {
    updateRoleButtons({ ...user, user_type: "student" });
    managedSection?.classList.add("d-none");
  });

  // Exco View: only if actual user_type is exco
  excoBtn.addEventListener("click", () => {
    if (user.user_type !== "exco") return;
    updateRoleButtons({ ...user, user_type: "exco" });
    renderManagedEvents(user);
  });
}

function updateRoleButtons(user) {
  const studentBtn = document.getElementById("switchToStudent");
  const excoBtn = document.getElementById("switchToExco");
  if (!studentBtn || !excoBtn) return;

  if (user.user_type === "exco") {
    excoBtn.classList.remove("btn-outline-primary");
    excoBtn.classList.add("btn-primary");
    studentBtn.classList.remove("btn-primary");
    studentBtn.classList.add("btn-outline-primary");
  } else {
    studentBtn.classList.remove("btn-outline-primary");
    studentBtn.classList.add("btn-primary");
    excoBtn.classList.remove("btn-primary");
    excoBtn.classList.add("btn-outline-primary");
  }
}

// -----------------------------------------
// HEADER PROFILE INFO
// -----------------------------------------
function renderProfile(user) {
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;

  // School is not in DB schema, so use a fixed label for now
  const school = user.school || "School of Computing";
  document.getElementById("profileSchool").textContent = school;

  // Optional avatar column; fallback to DiceBear
  const avatarUrl =
    user.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=John";
  document.getElementById("profileAvatar").src = avatarUrl;

  const roleText = user.user_type === "exco" ? "CCA Exco" : "Student";
  const roleClass = user.user_type === "exco" ? "bg-primary" : "bg-secondary";

  const roleEl = document.getElementById("profileRole");
  roleEl.textContent = roleText;
  roleEl.className = `badge ${roleClass}`;

  // Optional CCA name later (if you join with cca_membership)
  const ccaContainer = document.getElementById("profileCCAContainer");
  if (ccaContainer) {
    if (user.cca) {
      document.getElementById("profileCCA").textContent = user.cca;
      ccaContainer.style.display = "block";
    } else {
      ccaContainer.style.display = "none";
    }
  }
}

// -----------------------------------------
// STATS + RECENT ACTIVITY (Supabase)
// -----------------------------------------
async function loadProfileStats(userId) {
  try {
    const { data: signups, error } = await supabase
      .from("event_signup")
      .select(
        `
        signup_id,
        event_id,
        signed_up_at,
        attendance_status,
        event (
          title,
          start_datetime,
          cca_points
        )
      `,
      )
      .eq("user_id", userId)
      .order("signed_up_at", { ascending: false });

    if (error) {
      console.error("Error loading event signups:", error);
      return;
    }

    const now = new Date();
    let eventsAttended = 0;
    let upcomingEvents = 0;
    let totalPoints = 0;
    const recentActivities = [];

    (signups || []).forEach((row) => {
      const ev = row.event;
      if (!ev) return;

      const start = ev.start_datetime ? new Date(ev.start_datetime) : null;
      const pts = ev.cca_points || 0;

      // Attended events = attendance_status 'present'
      if (row.attendance_status === "present") {
        eventsAttended += 1;
        totalPoints += pts;
      }

      // Upcoming events (date in future)
      if (start && start > now) {
        upcomingEvents += 1;
      }

      // Top 3 recent sign-ups
      if (recentActivities.length < 3) {
        recentActivities.push({
          title: ev.title,
          signedUpAt: row.signed_up_at,
          points: pts,
        });
      }
    });

    const eventsAttendedEl = document.getElementById("eventsAttendedCount");
    if (eventsAttendedEl) eventsAttendedEl.textContent = eventsAttended;

    const pointsEl = document.getElementById("ccaPointsCount");
    if (pointsEl) pointsEl.textContent = totalPoints;

    const upcomingEl = document.getElementById("upcomingEventsCount");
    if (upcomingEl) upcomingEl.textContent = upcomingEvents;

    // Update tier progress bar
    updateTierProgressBar(totalPoints);

    const recentContainer = document.getElementById("recentActivityList");
    if (!recentContainer) return;

    if (!recentActivities.length) {
      recentContainer.innerHTML =
        '<p class="text-muted mb-0">No recent activity yet.</p>';
      return;
    }

    const recentHtml = recentActivities
      .map(
        (a) => `
        <div class="activity-item">
          <div class="d-flex justify-content-between align-items-center p-3 rounded bg-light mb-2">
            <div>
              <p class="fw-medium mb-1">${a.title}</p>
              <p class="text-muted small mb-0">Signed up on ${formatDate(
                a.signedUpAt,
              )}</p>
            </div>
            <span class="badge bg-secondary">
              <i class="bi bi-trophy me-1"></i>${a.points || 0} pts
            </span>
          </div>
        </div>
      `,
      )
      .join("");

    recentContainer.innerHTML = recentHtml;
  } catch (err) {
    console.error("Error computing profile stats:", err);
  }
}

// -----------------------------------------
// TIER PROGRESS BAR
// -----------------------------------------
const TIER_THRESHOLDS = {
  bronze: 15,
  silver: 30,
  gold: 45,
  goldPlus: 46,
};

function getTierInfo(points) {
  if (points >= TIER_THRESHOLDS.goldPlus) {
    return {
      name: "Gold with Honours",
      badge: "Gold+",
      color: "warning",
      bgColor: "#ffd700",
      nextThreshold: null,
    };
  } else if (points >= TIER_THRESHOLDS.gold) {
    return {
      name: "Gold",
      badge: "Gold",
      color: "warning",
      bgColor: "#ffd700",
      nextThreshold: TIER_THRESHOLDS.goldPlus,
    };
  } else if (points >= TIER_THRESHOLDS.silver) {
    return {
      name: "Silver",
      badge: "Silver",
      color: "secondary",
      bgColor: "#c0c0c0",
      nextThreshold: TIER_THRESHOLDS.gold,
    };
  } else {
    return {
      name: "Bronze",
      badge: "Bronze",
      color: "secondary",
      bgColor: "#cd7f32",
      nextThreshold: TIER_THRESHOLDS.silver,
    };
  }
}

function updateTierProgressBar(totalPoints) {
  const tierInfo = getTierInfo(totalPoints);
  const maxPoints = TIER_THRESHOLDS.goldPlus;

  // Update badge
  const tierBadge = document.getElementById("tierBadge");
  if (tierBadge) {
    tierBadge.className = `badge bg-${tierInfo.color}`;
    tierBadge.textContent = tierInfo.badge;
  }

  // Update progress text
  const tierProgress = document.getElementById("tierProgress");
  if (tierProgress) {
    tierProgress.textContent = `${totalPoints} / ${maxPoints} pts`;
  }

  // Update progress bar
  const progressBar = document.getElementById("tierProgressBar");
  if (progressBar) {
    const percentage = Math.min((totalPoints / maxPoints) * 100, 100);
    progressBar.style.width = `${percentage}%`;
    progressBar.className = `progress-bar bg-${tierInfo.color}`;
    progressBar.setAttribute("aria-valuenow", totalPoints);

    const percentageSpan = document.getElementById("tierPercentage");
    if (percentageSpan) {
      percentageSpan.textContent = `${Math.round(percentage)}%`;
    }
  }
}

// -----------------------------------------
// DELETE MANAGED EVENT (EXCO)
// -----------------------------------------
async function renderManagedEvents(user) {
  const section = document.getElementById("managedEventsSection");
  if (!section) return;

  // Only for EXCO users
  if (user.user_type !== "exco") {
    section.classList.add("d-none");
    return;
  }

  try {
    const { data: events, error } = await supabase
      .from("event")
      .select(
        `
        event_id,
        title,
        start_datetime,
        end_datetime,
        location,
        image_path,
        capacity,
        registered_count,
        cca_points
      `,
      )
      .eq("created_by", user.user_id)
      .order("start_datetime", { ascending: true });

    if (error) {
      console.error("Error loading managed events:", error);
      section.classList.add("d-none");
      return;
    }

    if (!events || !events.length) {
      section.classList.add("d-none");
      return;
    }

    section.classList.remove("d-none");

    const countText = `Managing ${events.length} event${
      events.length !== 1 ? "s" : ""
    } for your CCA`;

    const managedCountEl = document.getElementById("managedEventsCount");
    if (managedCountEl) managedCountEl.textContent = countText;

    const listEl = document.getElementById("managedEventsList");
    if (!listEl) return;

    const listHTML = events
      .map((ev) => {
        const img =
          ev.image_path || "https://via.placeholder.com/96x96?text=Event";
        const dateText = formatDate(ev.start_datetime);
        const timeText = new Date(ev.start_datetime).toLocaleTimeString(
          "en-SG",
          { hour: "2-digit", minute: "2-digit" },
        );
        const attendees = ev.registered_count || 0;
        const maxAttendees = ev.capacity || null;
        const pts = ev.cca_points || 0;

        return `
        <div class="card mb-3 border">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <img src="${img}"
                     alt="${ev.title}"
                     class="rounded"
                     style="width: 96px; height: 96px; object-fit: cover;">
              </div>
              <div class="col">
                <h5 class="fw-bold mb-2">${ev.title}</h5>
                <div class="text-muted small">
                  <div class="mb-1">
                    <i class="bi bi-calendar me-1"></i>${dateText}
                    <span class="mx-2">•</span>
                    <i class="bi bi-clock me-1"></i>${timeText}
                  </div>
                  <div class="mb-1">
                    <i class="bi bi-geo-alt me-1"></i>${ev.location || "TBA"}
                  </div>
                  <div>
                    <i class="bi bi-people me-1"></i>
                    ${attendees}${
                      maxAttendees ? ` / ${maxAttendees}` : ""
                    } registered
                  </div>
                </div>
              </div>
              <div class="col-auto d-flex flex-column gap-2">
                <span class="badge bg-primary">
                  <i class="bi bi-trophy me-1"></i>${pts} pts
                </span>
                <button class="btn btn-sm btn-outline-primary" data-view-id="${
                  ev.event_id
                }">
                  <i class="bi bi-eye me-1"></i>View
                </button>
                <button class="btn btn-sm btn-outline-danger" data-delete-id="${
                  ev.event_id
                }" data-delete-title="${ev.title}">
                  <i class="bi bi-trash me-1"></i>Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    listEl.innerHTML = listHTML;

    // Attach handlers
    listEl.querySelectorAll("[data-view-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-view-id");
        if (id) {
          window.location.href = `event-details.html?id=${id}`;
        }
      });
    });

    listEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-delete-id");
        const title = btn.getAttribute("data-delete-title");
        deleteEventFromProfile(id, title, user);
      });
    });
  } catch (err) {
    console.error("Error rendering managed events:", err);
    section.classList.add("d-none");
  }
}

// -----------------------------------------
// DELETE MANAGED EVENT (EXCO)
// -----------------------------------------
function deleteEventFromProfile(eventId, eventTitle, user) {
  currentDeleteId = eventId;
  currentUserForDelete = user;

  const modalEl = document.getElementById("deleteModal");
  if (!modalEl) return;

  const bodyText = modalEl.querySelector(".modal-body p");
  if (bodyText) {
    bodyText.textContent = `Are you sure you want to delete "${eventTitle}"? This action cannot be undone.`;
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

async function confirmDelete() {
  if (!currentDeleteId) return;

  try {
    const res = await fetch(`/api/events/${currentDeleteId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast("Error", json.error || "Failed to delete event.", "error");
    } else {
      showToast(
        "Event Deleted",
        "Event has been removed successfully.",
        "success",
      );
      if (currentUserForDelete) {
        await renderManagedEvents(currentUserForDelete);
      }
    }
  } catch (err) {
    console.error("Error deleting event:", err);
    showToast("Error", "Server error deleting event.", "error");
  } finally {
    const modalEl = document.getElementById("deleteModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal?.hide();
    currentDeleteId = null;
    currentUserForDelete = null;
  }
}
