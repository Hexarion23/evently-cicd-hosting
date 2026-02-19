// past-events.js
// Page to view all past events + feedback, and allow
// students to write/edit/delete feedback ONLY for events they attended.

import { supabase, getBackendUser } from "./data.js";

let currentUser = null;
let eventsState = []; // normalized [{ id, title, ..., canReview, feedbackList, userFeedback }]

document.addEventListener("DOMContentLoaded", () => {
  initPastEventsPage().catch((err) =>
    console.error("Error initializing past events page:", err),
  );
});

async function initPastEventsPage() {
  // 1) Ensure user is logged in (backend auth)
  currentUser = await getBackendUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  } 

  // STEP 4: Now it's safe to log or call functions that need the user
  console.log("Logged in as:", currentUser);
  await loadPastEvents(currentUser);

}

// ------------------------------------------
// Load past events + attendance + feedback
// ------------------------------------------
async function loadPastEvents(user) {
  const container = document.getElementById("pastEventsList");
  container.innerHTML =
    '<div class="text-center py-5 text-muted">Loading past events...</div>';

  try {
    const nowIso = new Date().toISOString();

    // 1) All past events (end_datetime < now)
    const { data: events, error: eventsError } = await supabase
      .from("event")
      .select(
        `
        event_id,
        title,
        description,
        start_datetime,
        end_datetime,
        location,
        cca_points,
        event_signup!inner(user_id)
      `,
      )
      .eq("event_signup.user_id", user.id)
      .order("end_datetime", { ascending: false });

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      container.innerHTML =
        '<div class="alert alert-info mb-0">No past events yet.</div>';
      eventsState = [];
      return;
    }

    const eventIds = events.map((e) => e.event_id);

    // 2) This user's signups for these events, to see if they attended
    const { data: signups, error: signupsError } = await supabase
      .from("event_signup")
      .select("event_id, attendance_status")
      .eq("user_id", user.id)
      .in("event_id", eventIds);

    if (signupsError) throw signupsError;

    const signupsMap = {};
    (signups || []).forEach((row) => {
      signupsMap[row.event_id] = row;
    });

    // 3) All feedback for these events
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from("event_feedback")
      .select(
        `
        feedback_id,
        event_id,
        user_id,
        rating,
        comment,
        created_at
      `,
      )
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    if (feedbackError) throw feedbackError;

    // 4) Get user names for feedback authors
    let userMap = {};
    if (feedbackRows && feedbackRows.length > 0) {
      const userIds = Array.from(
        new Set(feedbackRows.map((row) => row.user_id)),
      );

      const { data: users, error: usersError } = await supabase
        .from("User")
        .select("user_id, name")
        .in("user_id", userIds);

      if (usersError) {
        console.error("Error fetching feedback user names:", usersError);
      } else {
        userMap = {};
        (users || []).forEach((u) => {
          userMap[u.user_id] = u;
        });
      }
    }

    // 5) Group feedback by event
    const feedbackMap = {};
    (feedbackRows || []).forEach((row) => {
      if (!feedbackMap[row.event_id]) feedbackMap[row.event_id] = [];
      feedbackMap[row.event_id].push({
        feedback_id: row.feedback_id,
        event_id: row.event_id,
        user_id: row.user_id,
        rating: row.rating,
        comment: row.comment || "",
        created_at: row.created_at,
        userName: userMap[row.user_id]?.name || "Student",
      });
    });

    // 6) Build normalized state
    eventsState = events.map((ev) => {
      const feedbackListRaw = feedbackMap[ev.event_id] || [];
      const feedbackList = feedbackListRaw.map((row) => ({
        ...row,
        isMine: row.user_id === user.id,
      }));

      return {
        id: ev.event_id,
        title: ev.title,
        description: ev.description || "",
        start_datetime: ev.start_datetime,
        end_datetime: ev.end_datetime,
        location: ev.location || "",
        cca_points: ev.cca_points,
        canReview:
          !!signupsMap[ev.event_id] &&
          signupsMap[ev.event_id].attendance_status === "present",
        feedbackList,
        userFeedback: feedbackList.find((f) => f.isMine) || null,
      };
    });

    renderEvents();
  } catch (err) {
    console.error("Error loading past events:", err);
    const container = document.getElementById("pastEventsList");
    container.innerHTML =
      '<div class="alert alert-danger mb-0">There was a problem loading past events. Please try again later.</div>';

    if (typeof showToast === "function") {
      showToast("Error", "Unable to load past events and feedback.", "error");
    }
  }
}

// ------------------------------------------
// Rendering
// ------------------------------------------
function renderEvents() {
  const container = document.getElementById("pastEventsList");

  if (!eventsState || eventsState.length === 0) {
    container.innerHTML =
      '<div class="alert alert-info mb-0">No past events found.</div>';
    return;
  }

  const html = eventsState
    .map((ev) => {
      return `
        <div class="card shadow-sm mb-4">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h5 class="card-title mb-1">${escapeHtml(ev.title)}</h5>
                <p class="text-muted mb-1">
                  ${formatDateTime(ev.start_datetime)} 
                  ${
                    ev.location
                      ? ` • <span class="fw-semibold">${escapeHtml(
                          ev.location,
                        )}</span>`
                      : ""
                  }
                </p>
                <p class="small mb-0 text-muted">
                  CCA Points: ${
                    ev.cca_points != null ? ev.cca_points : "Not specified"
                  }
                </p>
              </div>
              <span class="badge bg-secondary align-self-start">Past event</span>
            </div>

            ${
              ev.description
                ? `<p class="mt-3 mb-2">${escapeHtml(ev.description)}</p>`
                : ""
            }

            <hr />

            <div class="mb-2 d-flex flex-wrap align-items-center gap-2">
              ${
                ev.canReview
                  ? '<span class="badge bg-success">You attended</span>'
                  : '<span class="badge bg-secondary">You did not attend</span>'
              }
              ${
                ev.canReview
                  ? `
                <button
                  class="btn btn-sm btn-outline-primary"
                  onclick="toggleFeedbackForm(${ev.id})"
                >
                  ${ev.userFeedback ? "Edit your feedback" : "Write feedback"}
                </button>
              `
                  : `<small class="text-muted">Only attendees can submit feedback.</small>`
              }
            </div>

            ${ev.canReview ? renderFeedbackForm(ev) : ""}

            <div class="mt-3">
              <h6 class="mb-2">All feedback</h6>
              ${renderFeedbackList(ev)}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = html;
}

function renderFeedbackForm(ev) {
  const existing = ev.userFeedback;
  const defaultRating = existing ? existing.rating : 5;
  const defaultComment = existing ? escapeHtml(existing.comment) : "";

  return `
    <div id="feedbackForm-${ev.id}" class="mt-3" style="display:none;">
      <form onsubmit="handleFeedbackSubmit(event, ${ev.id})">
        <div class="row g-3 align-items-center">
          <div class="col-sm-3">
            <label class="form-label mb-1" for="rating-${ev.id}">
              Rating
            </label>
            <select
              id="rating-${ev.id}"
              class="form-select form-select-sm"
            >
              ${[1, 2, 3, 4, 5]
                .map(
                  (r) =>
                    `<option value="${r}" ${
                      r === defaultRating ? "selected" : ""
                    }>${r} / 5</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="col-sm-9">
            <label class="form-label mb-1" for="comment-${ev.id}">
              Comment
            </label>
            <textarea
              id="comment-${ev.id}"
              class="form-control form-control-sm"
              rows="2"
              placeholder="Share your experience..."
            >${defaultComment}</textarea>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary btn-sm">
            ${existing ? "Update feedback" : "Submit feedback"}
          </button>
          ${
            existing
              ? `<button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  onclick="handleFeedbackDelete(${ev.id})"
                >
                  Delete feedback
                </button>`
              : ""
          }
          <button
            type="button"
            class="btn btn-link btn-sm text-muted"
            onclick="toggleFeedbackForm(${ev.id}, false)"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderFeedbackList(ev) {
  if (!ev.feedbackList || ev.feedbackList.length === 0) {
    return `<p class="text-muted small mb-0">
      No feedback yet.
      ${
        ev.canReview
          ? "Be the first to share your thoughts!"
          : "Once students attend this event, their feedback will appear here."
      }
    </p>`;
  }

  return ev.feedbackList
    .map((f) => {
      const created = f.created_at
        ? formatDateTime(f.created_at)
        : "Unknown date";

      return `
        <div class="border rounded p-2 mb-2">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="small fw-semibold">
                ${escapeHtml(f.userName)}
                ${
                  f.isMine
                    ? '<span class="badge bg-primary-subtle text-primary border ms-1">You</span>'
                    : ""
                }
              </div>
              <div class="small text-warning">
                ${renderStars(f.rating)}
              </div>
            </div>
            <div class="small text-muted">
              ${created}
            </div>
          </div>
          ${
            f.comment
              ? `<p class="small mb-0 mt-1">${escapeHtml(f.comment)}</p>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

// ------------------------------------------
// Feedback actions
// ------------------------------------------
function toggleFeedbackForm(eventId, forceOpen) {
  const formEl = document.getElementById(`feedbackForm-${eventId}`);
  if (!formEl) return;

  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : formEl.style.display === "none" || !formEl.style.display;

  formEl.style.display = shouldOpen ? "block" : "none";

  if (shouldOpen) {
    // Pre-fill with existing data if any
    const ev = eventsState.find((x) => x.id === eventId);
    if (!ev) return;

    const ratingEl = document.getElementById(`rating-${eventId}`);
    const commentEl = document.getElementById(`comment-${eventId}`);

    if (ev.userFeedback) {
      ratingEl.value = String(ev.userFeedback.rating);
      commentEl.value = ev.userFeedback.comment || "";
    } else {
      ratingEl.value = "5";
      commentEl.value = "";
    }
  }
}

async function handleFeedbackSubmit(e, eventId) {
  e.preventDefault();

  const ev = eventsState.find((x) => x.id === eventId);
  if (!ev) return;

  if (!ev.canReview) {
    if (typeof showToast === "function") {
      showToast(
        "Not allowed",
        "You can only submit feedback for events you attended.",
        "error",
      );
    }
    return;
  }

  const ratingEl = document.getElementById(`rating-${eventId}`);
  const commentEl = document.getElementById(`comment-${eventId}`);

  const rating = parseInt(ratingEl.value, 10);
  const comment = (commentEl.value || "").trim();

  if (!rating || rating < 1 || rating > 5) {
    if (typeof showToast === "function") {
      showToast(
        "Invalid rating",
        "Please choose a rating between 1 and 5.",
        "error",
      );
    }
    return;
  }

  const isUpdate = !!ev.userFeedback;

  try {
    if (isUpdate) {
      // UPDATE existing feedback
      const { data, error } = await supabase
        .from("event_feedback")
        .update({
          rating,
          comment,
        })
        .eq("feedback_id", ev.userFeedback.feedback_id)
        .eq("user_id", currentUser.id)
        .eq("event_id", eventId)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      ev.userFeedback = {
        ...ev.userFeedback,
        rating: data.rating,
        comment: data.comment || "",
        created_at: data.created_at,
      };

      ev.feedbackList = ev.feedbackList.map((f) =>
        f.feedback_id === ev.userFeedback.feedback_id
          ? {
              ...f,
              rating: data.rating,
              comment: data.comment || "",
            }
          : f,
      );

      if (typeof showToast === "function") {
        showToast(
          "Feedback updated",
          "Your feedback has been updated successfully.",
        );
      }
    } else {
      // INSERT new feedback
      const { data, error } = await supabase
        .from("event_feedback")
        .insert([
          {
            event_id: eventId,
            user_id: currentUser.id,
            rating,
            comment,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      const newFeedback = {
        feedback_id: data.feedback_id,
        event_id: data.event_id,
        user_id: data.user_id,
        rating: data.rating,
        comment: data.comment || "",
        created_at: data.created_at,
        userName: currentUser.name || "You",
        isMine: true,
      };

      ev.userFeedback = newFeedback;
      ev.feedbackList.push(newFeedback);

      if (typeof showToast === "function") {
        showToast("Feedback added", "Thanks for sharing your feedback!");
      }
    }

    toggleFeedbackForm(eventId, false);
    renderEvents();
  } catch (err) {
    console.error("Error saving feedback:", err);
    if (typeof showToast === "function") {
      showToast("Error", "There was a problem saving your feedback.", "error");
    }
  }
}

async function handleFeedbackDelete(eventId) {
  const ev = eventsState.find((x) => x.id === eventId);
  if (!ev || !ev.userFeedback) return;

  const confirmed = window.confirm(
    "Are you sure you want to delete your feedback for this event?",
  );
  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from("event_feedback")
      .delete()
      .eq("feedback_id", ev.userFeedback.feedback_id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    // Remove from local state
    ev.feedbackList = ev.feedbackList.filter(
      (f) => f.feedback_id !== ev.userFeedback.feedback_id,
    );
    ev.userFeedback = null;

    if (typeof showToast === "function") {
      showToast("Feedback deleted", "Your feedback has been removed.");
    }

    renderEvents();
  } catch (err) {
    console.error("Error deleting feedback:", err);
    if (typeof showToast === "function") {
      showToast(
        "Error",
        "There was a problem deleting your feedback.",
        "error",
      );
    }
  }
}

// ------------------------------------------
// Helpers
// ------------------------------------------
function renderStars(rating) {
  const r = Number(rating) || 0;
  const full = "★".repeat(r);
  const empty = "☆".repeat(Math.max(0, 5 - r));
  return `${full}${empty}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

// Expose handlers for inline onclick in generated HTML
window.toggleFeedbackForm = toggleFeedbackForm;
window.handleFeedbackSubmit = handleFeedbackSubmit;
window.handleFeedbackDelete = handleFeedbackDelete;
