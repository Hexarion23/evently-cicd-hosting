let currentEventId = null;

document.addEventListener("DOMContentLoaded", () => {
  loadPendingEvents();
});

async function loadPendingEvents() {
  const container = document.getElementById("pendingContainer");

  try {
    const res = await fetch("/api/events/teacher/pending", {
      credentials: "include",
    });

    if (res.status === 403 || res.status === 401) {
      container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="bi bi-lock-fill me-2"></i> Access Denied. You must be logged in as a Teacher.
                    </div>
                </div>`;
      return;
    }

    const events = await res.json();

    if (!events || events.length === 0) {
      container.innerHTML = `
                <div class="col-12 text-center text-muted py-5">
                    <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                    <h5>No pending approvals</h5>
                    <p>All caught up! New proposals will appear here.</p>
                </div>`;
      return;
    }

    container.innerHTML = events
      .map(
        (event) => `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="badge bg-warning text-dark">Pending</span>
                            <small class="text-muted">${new Date(event.created_at).toLocaleDateString()}</small>
                        </div>
                        <h5 class="card-title fw-bold text-truncate">${event.title}</h5>
                        <p class="small text-primary mb-2">${event.cca?.name || "Unknown CCA"}</p>
                        <p class="card-text text-muted text-truncate">${event.description}</p>
                    </div>
                    <div class="card-footer bg-white border-top-0 pb-3">
                        <button class="btn btn-primary w-100" 
                            onclick="openReviewModal(
                                '${event.event_id}', 
                                '${escapeHtml(event.title)}', 
                                '${escapeHtml(event.description)}', 
                                '${event.User?.name}', 
                                '${event.start_datetime}',
                                '${event.location}', 
                                '${event.cca?.name}',
                                '${event.proposal_path || ""}'
                            )">
                            Review Proposal
                        </button>
                    </div>
                </div>
            </div>
        `,
      )
      .join("");
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="alert alert-danger">Error loading events. Check console.</div>`;
  }
}

// Open Modal
window.openReviewModal = (id, title, desc, author, date, loc, cca, file) => {
  currentEventId = id;
  document.getElementById("reviewTitle").textContent = title;
  document.getElementById("reviewDescription").textContent = desc;
  document.getElementById("reviewAuthor").textContent = author || "Unknown";
  document.getElementById("reviewDate").textContent = new Date(
    date,
  ).toDateString();
  document.getElementById("reviewLocation").textContent = loc || "TBD";
  document.getElementById("reviewCca").textContent = cca || "CCA Event";

  const btn = document.getElementById("reviewDownloadBtn");
  const msg = document.getElementById("noFileMsg");

  // Check if file is valid
  if (file && file !== "null" && file !== "") {
    btn.href = file;
    btn.classList.remove("d-none");
    msg.classList.add("d-none");
  } else {
    btn.classList.add("d-none");
    msg.classList.remove("d-none");
  }

  new bootstrap.Modal(document.getElementById("reviewModal")).show();
};

// Submit Review
window.submitReview = async (status) => {
  if (!currentEventId) return;
  if (!confirm(`Confirm ${status.toUpperCase()}?`)) return;

  try {
    const res = await fetch(`/api/events/${currentEventId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      credentials: "include",
    });

    if (res.ok) {
      // Hide modal manually
      const modalEl = document.getElementById("reviewModal");
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal.hide();

      await loadPendingEvents(); // Refresh list
      alert(`Event ${status} successfully!`);
    } else {
      const err = await res.json();
      alert("Error: " + err.error);
    }
  } catch (err) {
    console.error(err);
    alert("Server error.");
  }
};

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}
