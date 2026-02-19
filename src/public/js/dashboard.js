// ========================================
// DASHBOARD.JS — FINAL FULL VERSION
// ========================================

// Global filters
let currentFilters = {
  search: "",
  school: "all",
  sort: "date",
  eventType: "all", // all | poly-wide | my-cca
};

// Cached user profile
let loggedInUser = null;
let userCCAIds = []; // Store all CCAs user is member of

// ========================================
// INITIAL LOAD
// ========================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadUser();

  setupEventTypeFilters();
  setupEventListeners();

  await renderStats();
  await renderEvents();
});

// ========================================
// LOAD LOGGED-IN USER (for My CCA filter)
// ========================================
async function loadUser() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      loggedInUser = null;
      userCCAIds = [];
      return;
    }

    const json = await res.json();
    loggedInUser = json.user || null;

    // Load DB user profile
    if (loggedInUser?.id) {
      const { data: profile } = await supabase
        .from("User")
        .select("*")
        .eq("user_id", loggedInUser.id)
        .single();

      loggedInUser.profile = profile || null;

      // Fetch all CCA memberships for this user
      const { data: memberships, error } = await supabase
        .from("cca_membership")
        .select("cca_id, role")
        .eq("user_id", loggedInUser.id);

      if (error) {
        console.error("Error loading CCA memberships:", error);
        userCCAIds = [];
      } else {
        userCCAIds =
          memberships.map((m) => ({
            cca_id: m.cca_id,
            role: m.role,
          })) || [];
      }
    }
  } catch (err) {
    console.error("loadUser error:", err);
    loggedInUser = null;
    userCCAIds = [];
  }
}

// ========================================
// FETCH EVENTS FROM SUPABASE
// ========================================
async function fetchEvents() {
  try {
    // Backend supports query params (advanced dashboard)
    const params = new URLSearchParams();

    if (currentFilters.search) params.set("search", currentFilters.search);
    if (currentFilters.sort) params.set("sort", currentFilters.sort);

    // Event type -> visibility
    if (currentFilters.eventType === "poly-wide") {
      params.set("visibility", "poly-wide");
    } else if (currentFilters.eventType === "all") {
      params.set("visibility", "all");
    }

    // Past/expired hiding (matches your frontend behaviour)
    params.set("hidePast", "1");
    params.set("hideExpired", "1");

    const res = await fetch(`/api/events?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      console.error("API error fetching events:", await res.text());
      return [];
    }

    const data = await res.json();

    return (data || []).map((ev) => ({
      id: ev.event_id,
      title: ev.title,
      description: ev.description || "",
      start_datetime: ev.start_datetime,
      sign_up_deadline: ev.sign_up_deadline || null,
      cca_points: ev.cca_points || null,
      rawDate: new Date(ev.start_datetime),
      date: new Date(ev.start_datetime).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      time: new Date(ev.start_datetime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      venue: ev.location || "TBA",
      imageUrl:
        ev.image_path ||
        "https://images.unsplash.com/photo-1506784365847-bbad939e9335",
      visibility: ev.visibility,
      cca_id: ev.cca_id,
      capacity: ev.capacity,
      status: ev.status,
    }));
  } catch (err) {
    console.error("ERROR FETCHING EVENTS:", err);
    return [];
  }
}


// ========================================
// EVENT TYPE FILTER BUTTONS
// ========================================
function setupEventTypeFilters() {
  const radios = document.querySelectorAll("#eventTypeFilters input");

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      currentFilters.eventType = radio.value;
      renderEvents();
    });
  });
}

// ========================================
// GENERAL FILTER INPUTS
// ========================================
function setupEventListeners() {
  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    currentFilters.search = e.target.value;
    renderEvents();
  });

  document.getElementById("sortFilter")?.addEventListener("change", (e) => {
    currentFilters.sort = e.target.value;
    renderEvents();
  });

  document.getElementById("clearFiltersBtn")?.addEventListener("click", () => {
    currentFilters = {
      search: "",
      sort: "date",
      eventType: "all",
    };

    document.getElementById("searchInput").value = "";
    document.getElementById("sortFilter").value = "date";
    document.getElementById("allEvents").checked = true;

    renderEvents();
  });
}

// ========================================
// FILTER LOGIC
// ========================================
function filterEvents(events) {
  let filtered = [...events];

  // 0. VITAL: Filter out 'pending' or 'rejected' events from the public dashboard
  filtered = filtered.filter((e) => e.status === "approved");

  // 🔍 Search
  if (currentFilters.search) {
    const s = currentFilters.search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(s) ||
        e.description.toLowerCase().includes(s),
    );
  }
  // 🚫 Hide events whose sign-up deadline has already passed
  filtered = filtered.filter((e) => {
    if (!e.sign_up_deadline) return true;
    const ddl = new Date(e.sign_up_deadline);
    const now = new Date();
    return ddl >= now;
  });
  // 🚫 Hide events whose start date has already passed
  filtered = filtered.filter((e) => {
    const eventDate = new Date(e.start_datetime || e.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate >= today;
  });

  // 🏫 School filter
  if (currentFilters.school !== "all") {
    filtered = filtered.filter((e) => e.school === currentFilters.school);
  }

  // ⭐ Event Type Filters
  if (currentFilters.eventType === "poly-wide") {
    filtered = filtered.filter((e) => e.visibility === "poly-wide");
  }

  if (currentFilters.eventType === "my-cca") {
    if (userCCAIds.length > 0) {
      const userCCAIdsList = userCCAIds.map((m) => m.cca_id);
      filtered = filtered.filter(
        (e) =>
          e.visibility === "cca-specific" && userCCAIdsList.includes(e.cca_id),
      );
    } else {
      filtered = []; // no CCA membership
    }
  }

  // 🔀 Sorting
  if (currentFilters.sort === "date") {
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // If sorting by points requested
  if (currentFilters.sort === "points") {
    filtered.sort((a, b) => (b.cca_points || 0) - (a.cca_points || 0));
  }

  return filtered;
}

function getSignUpButtonState(event) {
  return {
    disabled: false,
    title: "View Details",
    class: "btn btn-primary w-100",
  };
}

// ========================================
// RENDER EVENTS
// ========================================
async function renderEvents() {
  const events = await fetchEvents();
  const filtered = filterEvents(events);

  const grid = document.getElementById("eventsGrid");
  const emptyState = document.getElementById("emptyState");

  if (!filtered.length) {
    grid.innerHTML = "";
    emptyState.classList.remove("d-none");
    return;
  }

  emptyState.classList.add("d-none");

  grid.innerHTML = filtered
    .map((ev) => {
      const btnState = getSignUpButtonState(ev);
      let btnHtml = `<button onclick="location.href='event-details.html?id=${ev.id}'" class="${btnState.class}">${btnState.title}</button>`;

      return `
      <div class="col-lg-4 col-md-6">
        <div class="card shadow-sm h-100">
          <img src="${ev.imageUrl}" class="card-img-top" style="height:200px; object-fit:cover">
          <div class="card-body d-flex flex-column">
            <h5>${ev.title}</h5>
            <p class="small text-muted flex-grow-1">${ev.description.substring(0, 100)}...</p>

            <div class="d-flex align-items-center mb-2">
              <i class="bi bi-calendar me-2"></i> ${ev.date}
            </div>

            <div class="d-flex align-items-center mb-2">
              <i class="bi bi-clock me-2"></i> ${ev.time}
            </div>

            <div class="d-flex align-items-center mb-2">
              <i class="bi bi-geo-alt me-2"></i> ${ev.venue}
            </div>
            
            <div class="d-flex align-items-center mb-2">
              <i class="bi bi-award me-2"></i>
              <small class="text-muted">Points: ${ev.cca_points != null ? ev.cca_points : "—"}</small>
            </div>

            <div class="mt-auto">
                ${btnHtml}
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// ========================================
// STATS
// ========================================
async function renderStats() {
  const events = await fetchEvents();
  const filtered = filterEvents(events);

  const totalEvents = filtered.length;
  const polyWideEvents = filtered.filter(
    (e) => e.visibility === "poly-wide",
  ).length;

  const statsHTML = `
    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-body">
          <p class="text-muted mb-1">Poly-wide Events</p>
          <h3 class="fw-bold">${polyWideEvents}</h3>
        </div>
      </div>
    </div>

    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100">
        <div class="card-body">
          <p class="text-muted mb-1">Total Active Events</p>
          <h3 class="fw-bold">${totalEvents}</h3>
        </div>
      </div>
    </div>
  `;

  document.getElementById("statsCards").innerHTML = statsHTML;
}

// ==============================
// IMAGE PREVIEW IN CREATE MODAL
// ==============================
document.getElementById("eventImage")?.addEventListener("change", (e) => {
  const preview = document.getElementById("eventImagePreview");
  const file = e.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.classList.remove("d-none");
    };
    reader.readAsDataURL(file);
  } else {
    preview.classList.add("d-none");
  }
});

// ==============================
// PRESET IMAGE SELECTION LOGIC
// ==============================
document.querySelectorAll(".preset-option").forEach((option) => {
  option.addEventListener("click", () => {
    const img = option.querySelector("img");
    const path = img.getAttribute("data-path");
    const preview = document.getElementById("eventImagePreview");

    document.getElementById("selectedPresetPath").value = path;
    document.getElementById("eventImage").value = ""; // Clear file upload

    document
      .querySelectorAll(".preset-img")
      .forEach((i) => (i.style.borderColor = "#dee2e6"));
    img.style.borderColor = "var(--sp-red)";
    img.style.borderWidth = "3px";

    preview.src = path;
    preview.classList.remove("d-none");
  });
});

// Clear presets if user manually picks a file instead
document.getElementById("eventImage")?.addEventListener("change", () => {
  document.getElementById("selectedPresetPath").value = "";
  document
    .querySelectorAll(".preset-img")
    .forEach((i) => (i.style.borderColor = "#dee2e6"));
});

// ==============================
// HANDLE CREATE EVENT FORM SUBMIT
// ==============================
// UPDATED to use FormData for Proposal + Image Upload
document
  .getElementById("submitEventBtn")
  .addEventListener("click", async () => {
    console.log("Submit button clicked");

    const submitBtn = document.getElementById("submitEventBtn");
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm"></span> Sending...';

    // 1. Basic Validation
    const title = document.getElementById("eventTitle").value.trim();
    const start = document.getElementById("eventStart").value;
    const end = document.getElementById("eventEnd").value;
    const now = new Date();

    if (!title || !start || !end) {
      alert("Please fill in required fields.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    if (new Date(start) < now) {
      alert("Event start date cannot be earlier than now.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    // 2. Prepare FormData (Replaces JSON object construction)
    const formData = new FormData();
    formData.append("title", title);
    formData.append(
      "description",
      document.getElementById("eventDescription").value.trim(),
    );
    formData.append(
      "visibility",
      document.getElementById("eventVisibility").value,
    );
    formData.append("start_datetime", start);
    formData.append("end_datetime", end);
    formData.append(
      "location",
      document.getElementById("eventLocation").value.trim(),
    );
    formData.append("capacity", document.getElementById("eventCapacity").value);
    formData.append(
      "cca_points_category",
      document.getElementById("eventPointsCategory").value,
    );

    // Optional values
    const deadline = document.getElementById("eventSignUpDeadline").value;
    if (deadline) formData.append("sign_up_deadline", deadline);

    const points = document.getElementById("eventCcaPoints").value;
    if (points) formData.append("cca_points", points);

    // Event Details
    formData.append(
      "agenda",
      document.getElementById("eventAgenda")?.value.trim() || "",
    );
    formData.append(
      "requirements",
      document.getElementById("eventRequirements")?.value.trim() || "",
    );
    formData.append(
      "notes",
      document.getElementById("eventNotes")?.value.trim() || "",
    );
    formData.append(
      "safety_guidelines",
      document.getElementById("eventSafetyGuidelines")?.value.trim() || "",
    );
    formData.append(
      "contact_person",
      document.getElementById("eventContactPerson")?.value.trim() || "",
    );
    formData.append(
      "contact_email",
      document.getElementById("eventContactEmail")?.value.trim() || "",
    );
    formData.append(
      "contact_phone",
      document.getElementById("eventContactPhone")?.value.trim() || "",
    );

    // 3. CCA ID Logic
    if (userCCAIds.length > 0) {
      formData.append("cca_id", userCCAIds[0].cca_id);
    } else {
      alert("Error: You do not appear to be an EXCO of any CCA.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    // 4. File Handling
    const imageInput = document.getElementById("eventImage");
    const presetPath = document.getElementById("selectedPresetPath").value;

    if (imageInput.files[0]) {
      // Use uploaded file
      formData.append("image", imageInput.files[0]);
    } else if (presetPath) {
      // Use selected preset path as a string
      formData.append("image", presetPath);
    } else {
      // Block submission if both are empty
      alert("Please select a preset image or upload your own event image.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }
    const proposalInput = document.getElementById("eventProposal"); // <--- NEW FIELD
    if (proposalInput && proposalInput.files[0]) {
      formData.append("proposal", proposalInput.files[0]);
    } else {
      alert("Please upload a Proposal Document for teacher approval.");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    try {
      // 5. Send to Backend
      const res = await fetch("/api/events/create", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create event");
      }

      // 6. Success
      alert(
        "Success! Your event proposal has been submitted to your Teacher for approval.",
      );

      // Notify EXCO logic (optional)
      if (
        typeof notifyExcoEventCreated === "function" &&
        loggedInUser?.profile?.user_id
      ) {
        await notifyExcoEventCreated(loggedInUser.profile.user_id, {
          title: title,
        });
      }

      location.reload();
    } catch (err) {
      console.error("Submit error:", err);
      alert("Error: " + err.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
