// Add this to the very top of navbar.js
import { 
  fetchAllNotifications,
  getUnreadNotificationCount, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from "../js/notifications.js";


// =========================================================
// initNavbar.js — UNIFIED ROLE & NAVBAR MANAGEMENT
// =========================================================

// Global logout function (referenced by the onclick attribute)
async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("eventlyUser");
    if (typeof showToast === "function") {
      showToast("Logged out", "You have been signed out.", "info");
    }
    window.location.href = "login.html";
  } catch (err) {
    console.error("Logout failed", err);
    window.location.href = "login.html"; // Fallback redirect
  }
}

window.logout = logout;

const initNavbar = async () => {
  let user = null;
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const createEventBtn = document.getElementById("createEventBtn");

  // 1. Fetch User Data
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });
    if (res.ok) {
      const json = await res.json();
      user = json.user;
    }
  } catch (err) {
    console.warn("User not logged in or session expired.");
  }

  // 2. Handle EXCO-specific Buttons (Outside the Navbar)
  if (user && user.role === "exco") {
    createEventBtn?.classList.remove("d-none");
  } else {
    createEventBtn?.classList.add("d-none");
  }

  // 3. Shared Brand Component
  const brandHTML = `
    <a class="navbar-brand d-flex align-items-center gap-2" href="index.html">
      <img src="../assets/sp_logo.jpg" alt="SP Logo" class="sp-logo" style="height: 32px; width: auto;">
      <span class="fw-bold d-none d-sm-block">Singapore Polytechnic</span>
      <span class="mx-1 text-muted" style="opacity: 0.4">|</span>
      <span class="text-gradient fw-bold">Evently</span>
    </a>`;

  // 4. Dynamic End Icons Component
  // Teachers get Logout, Students/EXCO get Profile

const getEndIconsHTML = (userRole) => {
  const profileOrLogout =
    userRole === "teacher"
      ? `<button class="btn btn-outline-danger btn-sm px-3" onclick="logout()">Logout</button>`
      : `<a class="nav-link fw-semibold text-dark" href="profile.html">Profile</a>`;

  return `
    <ul class="navbar-nav ms-auto align-items-center gap-2">
      <li class="nav-item dropdown me-2">
        <button class="notification-btn" id="notificationDropdown" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-bell-fill"></i>
          <span class="notification-badge" id="notificationBadge" style="display:none;">0</span>
        </button>
        <div class="dropdown-menu dropdown-menu-end notification-dropdown shadow border-0" id="notificationMenu">
          <div class="notification-header">
            <div class="notification-header-title">
              <h6 class="mb-0"><i class="bi bi-bell-fill me-2"></i>Notifications</h6>
              <span class="notification-count-badge" id="notificationCountBadge">0 new</span>
            </div>
            <div class="notification-actions">
              <button class="notification-action-btn" id="markAllReadBtn" onclick="markAllAsRead()">
                <i class="bi bi-check2-all"></i> Mark all read
              </button>
            </div>
          </div>
          <div class="notification-list" id="notificationList">
            </div>
        </div>
      </li>

      <li class="nav-item">
        <a href="messenger.html" class="nav-link"><i class="bi bi-chat-dots fs-5"></i></a>
      </li>
      <li class="nav-item">
        ${profileOrLogout}
      </li>
    </ul>`;
};

  let navContent = "";

  // 5. Build Content Based on Role
  if (!user) {
    // --- GUEST NAV ---
    navContent = `
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto align-items-center gap-2">
            <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
            <li class="nav-item"><a class="nav-link" href="login.html">Login</a></li>
            <li class="nav-item"><a class="btn btn-primary px-4" href="register.html">Get Started</a></li>
          </ul>
        </div>`;
  } else if (user.role === "teacher") {
    // --- TEACHER NAV ---
    navContent = `
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0 gap-3 ms-3 align-items-center">
            <li class="nav-item">
                <a href="teacher-dashboard.html" id="teacher-nav-link" class="nav-link d-flex align-items-center gap-1 fw-bold text-danger">
                    <i class="bi bi-shield-lock me-1"></i>Approvals
                </a>
            </li>
            <li class="nav-item"><span class="badge" style="background: linear-gradient(135deg, #C8102E, #A00D24); padding: 0.5rem 1rem; font-weight: 600;">Teacher Mode</span></li>
          </ul>
          ${getEndIconsHTML(user.role)}
        </div>`;
  } else {
    // --- STUDENT / EXCO NAV ---
    const isExco = user.role === "exco";
    const isCommandCenter = currentPath === "event-command-center.html";

    navContent = `
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0 gap-1 ms-3 align-items-center">
            <li class="nav-item"><a class="nav-link" href="dashboard.html">Dashboard</a></li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">My Hub</a>
              <ul class="dropdown-menu border-0 shadow-sm">
                <li><a class="dropdown-item" href="calendar.html"><i class="bi bi-calendar-event me-2"></i>My Calendar</a></li>
                <li><a class="dropdown-item" href="past-events.html"><i class="bi bi-clock-history me-2"></i>History</a></li>
                ${isExco ? `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item" href="analytics.html"><i class="bi bi-bar-chart me-2"></i>CCA Analytics</a></li>` : ""}
              </ul>
            </li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Tools</a>
              <ul class="dropdown-menu border-0 shadow-sm">
                <li><a class="dropdown-item" href="qr-scanner.html"><i class="bi bi-qr-code-scan me-2"></i>QR Scanner</a></li>
                ${isExco ? `<li><a class="dropdown-item" href="proposal-builder.html"><i class="bi bi-file-earmark-text me-2"></i>Proposal Builder</a></li>` : ""}
                ${isExco ? `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item text-danger fw-semibold" href="waitlist-admin.html"><i class="bi bi-shield-lock me-2"></i>Waitlist Admin</a></li>` : ""}
              </ul>
            </li>
            ${
              isExco && isCommandCenter
                ? `
            <li class="nav-item ms-lg-3">
              <a href="analytics.html" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-arrow-left me-1"></i> Back to Analytics
              </a>
            </li>`
                : ""
            }
          </ul>
          ${getEndIconsHTML(user.role)}
        </div>`;
  }

  // 6. Injection
  const navbarElement = document.createElement("nav");
  navbarElement.className =
    "navbar navbar-expand-lg navbar-light sticky-top bg-white border-bottom";
  navbarElement.innerHTML = `<div class="container-fluid px-4">${brandHTML}${navContent}</div>`;
  document.body.prepend(navbarElement);

  // 7. Active Link Highlighting
  document
    .querySelectorAll(".nav-link, .dropdown-item, .btn-outline-primary")
    .forEach((link) => {
      if (link.getAttribute("href") === currentPath) {
        link.classList.add("active");
        const parentDropdown = link.closest(".dropdown");
        if (parentDropdown)
          parentDropdown.querySelector(".nav-link").classList.add("active");
      }
    });

  if (user) {
    refreshNotifications(user.id);
  }
};

// --- Add these helper functions to the top or bottom of navbar.js ---

async function refreshNotifications(userId) {
  const badge = document.getElementById("notificationBadge");
  const countBadge = document.getElementById("notificationCountBadge");
  const list = document.getElementById("notificationList");

  // 1. Get Unread Count
  const unreadCount = await getUnreadNotificationCount(userId);
  if (badge) badge.textContent = unreadCount;
  if (countBadge) countBadge.textContent = `${unreadCount} new`;
  if (badge) badge.style.display = unreadCount > 0 ? "flex" : "none";

  // 2. Get Recent Notifications (Top 5)
  const notifications = await fetchAllNotifications(userId, 5);
  if (!list) return;

  if (!notifications || notifications.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-muted small">No notifications yet</div>`;
    return;
  }

  list.innerHTML = notifications
    .map(
      (n) => `
    <div class="notification-item ${n.is_read ? "" : "unread"}" onclick="handleNotificationClick(${n.id}, ${userId})">
      <div class="notification-content">
        <p class="mb-1">${n.message}</p>
        <span class="notification-time">${new Date(n.created_at).toLocaleDateString()}</span>
      </div>
      ${!n.is_read ? '<span class="unread-dot"></span>' : ""}
    </div>
  `,
    )
    .join("");
}

// Global function for "Mark All Read" button
window.markAllAsRead = async () => {
  const res = await fetch("/api/auth/me");
  const json = await res.json();
  if (json.user) {
    await markAllNotificationsAsRead(json.user.id);
    refreshNotifications(json.user.id);
  }
};

// Handle individual click
window.handleNotificationClick = async (id, userId) => {
  await markNotificationAsRead(id);
  refreshNotifications(userId);
};


initNavbar();
