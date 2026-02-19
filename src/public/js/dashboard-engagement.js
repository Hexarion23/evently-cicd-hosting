// public/js/dashboard-engagement.js

document.addEventListener("DOMContentLoaded", () => {
  fetchEngagement();
  fetchRecommendations();
});

async function fetchEngagement() {
  const scoreEl = document.getElementById("engagementScore");
  const levelEl = document.getElementById("engagementLevel");
  const statsEl = document.getElementById("engagementStats");

  if (!scoreEl || !levelEl || !statsEl) return;

  try {
    const res = await fetch("/api/engagement/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      scoreEl.textContent = "–";
      levelEl.textContent = "Login to see your engagement";
      statsEl.textContent = "";
      return;
    }

    const data = await res.json();

    scoreEl.textContent = data.score ?? "0";
    levelEl.textContent = data.level || "New Explorer";
    statsEl.textContent = `Events signed up: ${data.totalSignups} · Attended: ${data.attendedCount} · Distinct events: ${data.distinctEventCount}`;
  } catch (err) {
    console.error("fetchEngagement error:", err);
  }
}

async function fetchRecommendations() {
  const container = document.getElementById("recommendedEventsList");
  if (!container) return;

  try {
    const res = await fetch("/api/engagement/recommendations?limit=4", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      container.innerHTML =
        '<p class="text-muted ms-1">Login to see personalised recommendations.</p>';
      return;
    }

    const json = await res.json();
    const events = json.events || [];

    if (!events.length) {
      container.innerHTML =
        '<p class="text-muted ms-1">No personalised recommendations right now. Check back later!</p>';
      return;
    }

    container.innerHTML = events
      .map((ev) => {
        const date = new Date(ev.start_datetime);
        const dateStr = date.toLocaleString("en-SG", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        const visibilityLabel =
          ev.visibility === "poly-wide" ? "Poly-wide" : "CCA Event";

        const img =
          ev.image_path ||
          "https://images.pexels.com/photos/3184298/pexels-photo-3184298.jpeg";

        return `
        <div class="col-md-6 col-lg-3">
          <div class="card h-100 shadow-sm border-0 rounded-3">
            <img src="${img}" class="card-img-top" alt="${ev.title}">
            <div class="card-body d-flex flex-column">
              <span class="badge bg-light text-dark mb-2">${visibilityLabel}</span>
              <h6 class="card-title mb-1">${ev.title}</h6>
              <small class="text-muted d-block mb-2">
                ${dateStr} · ${ev.location || "On campus"}
              </small>
              <p class="card-text text-muted small flex-grow-1">
                ${(ev.description || "").slice(0, 90)}${(ev.description || "")
          .length > 90
          ? "..."
          : ""}
              </p>
              <a href="/event-details.html?id=${ev.event_id}" class="btn btn-sm btn-primary mt-auto">
                View Event
              </a>
            </div>
          </div>
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error("fetchRecommendations error:", err);
    container.innerHTML =
      '<p class="text-muted ms-1">Unable to load recommendations right now.</p>';
  }
}
