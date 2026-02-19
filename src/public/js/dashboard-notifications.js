// ============================
// DASHBOARD NOTIFICATIONS
// ============================

let notificationBadge = document.getElementById("notificationBadge");
let notificationList = document.getElementById("notificationList");
let notificationDropdown = document.getElementById("notificationDropdown");
let notificationRealtimeChannel = null;


// Load and display notifications when page loads
document.addEventListener("DOMContentLoaded", async () => {
  await loadNotifications();
  
  // Refresh notifications every 30 seconds (fallback)
  setInterval(loadNotifications, 30000);

  // Mark all as read when dropdown is opened
  if (notificationDropdown) {
    notificationDropdown.addEventListener("click", async () => {
      // Brief delay to ensure dropdown has opened
      setTimeout(() => {
        markAllNotificationsAsRead();
      }, 100);
    });
  }

  setupNotificationRealtime(); // 🔹 NEW
});


/**
 * Load and display notifications in the dropdown
 */
async function loadNotifications() {
  try {
    // Fetch unread count
    const countRes = await fetch("/api/notifications/count/unread", {
      method: "GET",
      credentials: "include",
    });

    if (!countRes.ok) {
      console.warn("Could not fetch notification count");
      return;
    }

    const countJson = await countRes.json();
    const unreadCount = countJson.count || 0;

    // Update badge
    if (notificationBadge) {
      if (unreadCount > 0) {
        notificationBadge.textContent = unreadCount;
        notificationBadge.classList.remove("d-none");
      } else {
        notificationBadge.classList.add("d-none");
      }
    }

    // Fetch actual notifications
    const notifRes = await fetch("/api/notifications?limit=10", {
      method: "GET",
      credentials: "include",
    });

    if (!notifRes.ok) {
      console.warn("Could not fetch notifications");
      if (notificationList) {
        notificationList.innerHTML =
          '<div class="dropdown-item text-muted small">Unable to load notifications</div>';
      }
      return;
    }

    const notifJson = await notifRes.json();
    const notifications = notifJson.data || [];

    // Render notifications
    if (notificationList) {
      if (notifications.length === 0) {
        notificationList.innerHTML =
          '<div class="dropdown-item text-muted small">No notifications</div>';
      } else {
        notificationList.innerHTML = notifications
          .map((notif) => {
            const createdAt = new Date(notif.created_at).toLocaleString("en-SG", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            const isUnread = !notif.is_read ? "font-weight-bold" : "";
            const unreadClass = !notif.is_read ? "bg-light" : "";

            return `
              <div class="dropdown-item small ${unreadClass}" style="cursor: pointer; border-bottom: 1px solid #eee;">
                <div class="${isUnread}">${notif.message}</div>
                <small class="text-muted d-block">${createdAt}</small>
              </div>
            `;
          })
          .join("");
      }
    }
  } catch (err) {
    console.error("Error loading notifications:", err);
  }
}

/**
 * Mark all notifications as read
 */
async function markAllNotificationsAsRead() {
  try {
    const res = await fetch("/api/notifications/mark-all-read", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      // Refresh the notification display
      await loadNotifications();
    }
  } catch (err) {
    console.error("Error marking notifications as read:", err);
  }
}

// ======================================================
// REALTIME: notifications for current user
// ======================================================
async function setupNotificationRealtime() {
  try {
    // Get current user from backend (same as other pages)
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      console.warn("Cannot setup notification realtime — user not logged in");
      return;
    }

    const json = await res.json();
    const user = json.user;
    if (!user || !user.id) return;

    if (!window.supabase) {
      console.warn("Supabase client not available on window");
      return;
    }

    // Clean up previous channel if any
    if (notificationRealtimeChannel) {
      supabase.removeChannel(notificationRealtimeChannel);
    }

    notificationRealtimeChannel = supabase
      .channel(`notifications_user_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("Realtime: new notification:", payload);
          // Just reload the list + badge
          loadNotifications();
        }
      )
      .subscribe((status) => {
        console.log("Notification realtime channel status:", status);
      });
  } catch (err) {
    console.error("setupNotificationRealtime error:", err);
  }
}

// Optional cleanup
window.addEventListener("beforeunload", () => {
  if (notificationRealtimeChannel) {
    supabase.removeChannel(notificationRealtimeChannel);
  }
});
