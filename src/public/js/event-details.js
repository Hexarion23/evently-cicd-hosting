// ============================
// Event Details Page Logic
// ============================

// Get event_id from URL
const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get("id");

if (!eventId) {
  alert("No event ID provided");
}

// Init page
let currentUser = null;
let userCCAMemberships = []; // Array of { cca_id, role }
let currentEvent = null;
let eventRealtimeChannel = null;
let promoTimerInterval = null;

// Hide waitlist info box initially (if exists)
const wlb = document.getElementById("waitlistInfoBox");
if (wlb) wlb.style.display = "none";

document.addEventListener("DOMContentLoaded", async () => {
  await fetchCurrentUser();
  await loadEvent();
  updateQRCodeVisibility(); // Show QR code if user is EXCO
  await loadEventDetails();
  await loadEventFiles();
  await setupSignupSection();
  setupEventRealtime(); // 🔹 Realtime
});

// ======================================================
// Load MAIN EVENT DATA (from "event" table)
// ======================================================
async function loadEvent() {
  const { data, error } = await supabase
    .from("event")
    .select(`*, cca(name)`)
    .eq("event_id", eventId)
    .single();

  if (error || !data) {
    console.error("Event load error:", error);
    return;
  }

  // Cache event globally for sign-up logic
  currentEvent = data;

  // Show the content
  document.getElementById("loadingState").classList.add("d-none");
  document.getElementById("eventContent").classList.remove("d-none");

  // Basic fields
  document.getElementById("eventTitle").textContent = data.title;
  document.getElementById("eventDescription").textContent =
    data.description || "";

  // Image
  const banner = document.getElementById("eventImage");
  if (data.image_path) {
    banner.src = data.image_path;
  } else {
    banner.src =
      "https://images.pexels.com/photos/3184298/pexels-photo-3184298.jpeg";
  }

  // Date / Time / Location
  const startDate = new Date(data.start_datetime);
  const endDate = new Date(data.end_datetime);

  document.getElementById("eventDate").textContent =
    startDate.toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  document.getElementById("eventTime").textContent =
    startDate.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
    }) +
    " - " +
    endDate.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
    });

  document.getElementById("eventLocation").textContent =
    data.location || "To be confirmed";

  // Sign-up deadline display
  const signupEl = document.getElementById("eventSignupDeadline");
  if (data.sign_up_deadline) {
    const ddl = new Date(data.sign_up_deadline);
    signupEl.textContent = ddl.toLocaleString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  } else {
    signupEl.textContent = "No deadline";
  }

  // Event meta
  document.getElementById("eventOrganizedBy").textContent =
    data.cca?.name || "Poly-wide";

  document.getElementById("eventCapacity").textContent =
    data.capacity || "No limit";

  document.getElementById("eventVisibility").textContent =
    data.visibility === "poly-wide" ? "Poly-wide" : "CCA-specific";

  document.getElementById("eventStatus").textContent =
    data.status || "upcoming";

  // CCA points category
  document.getElementById("ccaPointsCategory").textContent =
    data.cca_points_category || "Not specified";

  const pointsValueSpan = document.getElementById("ccaPointsValue");
  pointsValueSpan.textContent =
    data.cca_points != null ? String(data.cca_points) : "—";

  // Numeric points value (explicit field)
  const pointsNumberEl = document.getElementById("ccaPointsNumber");
  pointsNumberEl.textContent =
    data.cca_points != null ? String(data.cca_points) : "—";

  // QR code (if available)
  if (data.qr_image_path) {
    const qrContainer = document.getElementById("qrCodeContainer");
    const qrImg = document.getElementById("eventQrCode");
    const dlBtn = document.getElementById("downloadQrBtn");

    qrImg.src = data.qr_image_path;
    qrImg.alt = `QR Code for ${data.title}`;

    dlBtn.href = data.qr_image_path;
    dlBtn.setAttribute("download", `${data.title.replace(/\s+/g, "_")}_qr.png`);

    // Hide initially - visibility will be determined after user data is loaded
    qrContainer.classList.add("d-none");
  }

  // ✅ Fetch and merge event_details into currentEvent
  const { data: detailsData } = await supabase
    .from("event_details")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (detailsData) {
    currentEvent.agenda = detailsData.agenda;
    currentEvent.requirements = detailsData.requirements;
    currentEvent.notes = detailsData.notes;
    currentEvent.safety_guidelines = detailsData.safety_guidelines;
    currentEvent.contact_person = detailsData.contact_person;
    currentEvent.contact_email = detailsData.contact_email;
    currentEvent.contact_phone = detailsData.contact_phone;
  }

  // 🔥 CHECK PENDING STATUS
  if (currentEvent.status === "pending") {
    renderPendingState();
  }
}

// ======================================================
// RENDER PENDING STATE (Hides Signup/QR)
// ======================================================
function renderPendingState() {
  // 1. Hide QR Code Container completely
  const qrContainer = document.getElementById("qrCodeContainer");
  if (qrContainer) qrContainer.classList.add("d-none");

  // 2. Hide Signup Button
  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) signupBtn.classList.add("d-none");

  // 3. Show Pending Message in the Status/Action area
  const signupStatus = document.getElementById("signupStatus");
  if (signupStatus) {
    signupStatus.innerHTML = `
      <div class="alert alert-warning border-warning text-center p-4">
        <i class="bi bi-hourglass-split fs-1 d-block mb-2 text-warning"></i>
        <h5 class="fw-bold text-dark">Pending Approval</h5>
        <p class="mb-0 small text-muted">
          This event is currently waiting for teacher approval.<br>
          Sign-ups and QR codes are disabled until approved.
        </p>
      </div>
    `;
  }

  // 4. Hide Waitlist Box if visible
  const wlb = document.getElementById("waitlistInfoBox");
  if (wlb) wlb.style.display = "none";
}

// ======================================================
// Load EXTENDED DETAILS from "event_details" table
// ======================================================
async function loadEventDetails() {
  const { data, error } = await supabase
    .from("event_details")
    .select("*")
    .eq("event_id", eventId)
    .single();

  if (error || !data) {
    console.warn("No extended details found.");
    return;
  }

  // Fill extended fields
  document.getElementById("eventAgenda").textContent = data.agenda || "—";

  document.getElementById("eventRequirements").textContent =
    data.requirements || "—";

  document.getElementById("eventSafety").textContent =
    data.safety_guidelines || "—";

  document.getElementById("eventNotes").textContent = data.notes || "—";

  // Contact Info
  document.getElementById("eventContactName").textContent =
    data.contact_person || "—";

  document.getElementById("eventContactEmail").textContent =
    data.contact_email || "";

  document.getElementById("eventContactPhone").textContent =
    data.contact_phone || "";
}

// ======================================================
// Load ATTACHED FILES ("event_file" table)
// ======================================================
async function loadEventFiles() {
  const list = document.getElementById("eventFilesList");

  const { data, error } = await supabase
    .from("event_file")
    .select("*")
    .eq("event_id", eventId);

  if (error) {
    console.error("Error loading event files:", error);
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML =
      '<li class="list-group-item text-muted">No files attached.</li>';
    return;
  }

  list.innerHTML = data
    .map(
      (file) => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span><strong>${file.file_type.toUpperCase()}</strong></span>
        <a href="${file.file_path}" target="_blank" class="btn btn-sm btn-primary">
          View
        </a>
      </li>
    `,
    )
    .join("");
}

// ======================================================
// SIGN-UP + ADVANCED WAITLIST LOGIC
// ======================================================

async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      console.log("User not logged in; sign-up requires login.");
      return;
    }

    const json = await res.json();
    currentUser = json.user;
    console.log("Current user:", currentUser);

    // Fetch CCA memberships for this user
    if (currentUser?.id) {
      const { data: memberships, error } = await supabase
        .from("cca_membership")
        .select("cca_id, role")
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("Error loading CCA memberships:", error);
        userCCAMemberships = [];
      } else {
        userCCAMemberships = memberships;
      }
    }
  } catch (err) {
    console.error("Error fetching current user:", err);
  }
}

// ======================================================
// UPDATE QR CODE VISIBILITY (only for EXCO members)
// ======================================================
function updateQRCodeVisibility() {
  if (!currentEvent) return;

  // 🔥 Guard: If Pending, Force Hide
  if (currentEvent.status === "pending") {
    const qrContainer = document.getElementById("qrCodeContainer");
    if (qrContainer) qrContainer.classList.add("d-none");
    return;
  }

  const qrContainer = document.getElementById("qrCodeContainer");
  if (!qrContainer) return;

  // Check if user is EXCO of this event's CCA
  const isExcoOfEventCCA = userCCAMemberships.some(
    (m) =>
      m.cca_id === currentEvent.cca_id &&
      m.role?.toLowerCase().includes("exco"),
  );

  if (isExcoOfEventCCA) {
    qrContainer.classList.remove("d-none");
    console.log("QR code visible for EXCO member");
  } else {
    qrContainer.classList.add("d-none");
    console.log("QR code hidden for non-EXCO user");
  }
}

async function setupSignupSection() {
  const signupBtn = document.getElementById("signupBtn");
  const signupStatus = document.getElementById("signupStatus");

  if (!signupBtn || !signupStatus) return;

  // No event yet
  if (!currentEvent) {
    signupBtn.disabled = true;
    signupStatus.textContent = "Event details are still loading...";
    return;
  }

  // 🔥 Guard: If Pending, Do Not Setup Signups
  if (currentEvent.status === "pending") {
    renderPendingState();
    return;
  }

  // Not logged in
  if (!currentUser) {
    signupBtn.textContent = "Login to Sign Up";
    signupBtn.classList.remove("btn-primary", "btn-warning", "btn-success");
    signupBtn.classList.add("btn-outline-primary");
    signupStatus.textContent =
      "Please log in as a student to sign up for events.";
    signupBtn.onclick = () => {
      window.location.href = "login.html";
    };
    return;
  }

  // Logged in — compute full state (signup / waitlist / promotion)
  await updateSignupState(signupBtn, signupStatus);
}

async function updateSignupState(signupBtn, signupStatus) {
  try {
    if (!currentUser || !currentEvent) return;

    // 🔥 Double Check Pending Status
    if (currentEvent.status === "pending") {
      renderPendingState();
      return;
    }

    // Prevent organiser from signing up for their own event
    // Note: DB column is 'created_by', ensure consistency
    const organiserId = currentEvent.created_by || currentEvent.organizer_id;
    if (currentUser.id === organiserId) {
      signupBtn.disabled = true;
      signupBtn.textContent = "You are the organiser";
      signupBtn.classList.remove(
        "btn-primary",
        "btn-warning",
        "btn-success",
        "btn-outline-primary",
        "btn-outline-secondary",
      );
      signupBtn.classList.add("btn-secondary");

      signupStatus.textContent =
        "Organisers cannot sign up, join the waitlist, or accept promotions for their own events.";

      // Hide waitlist info if visible
      const infoBox = document.getElementById("waitlistInfoBox");
      if (infoBox) infoBox.style.display = "none";

      return;
    }

    const eventIdInt = parseInt(eventId, 10);

    // Determine if sign-up deadline has passed
    let deadlinePassed = false;
    if (currentEvent.sign_up_deadline) {
      const now = new Date();
      const ddl = new Date(currentEvent.sign_up_deadline);
      deadlinePassed = now > ddl;
    }

    // 1. Check if user already signed up
    const { data: existingSignup, error: existingError } = await supabase
      .from("event_signup")
      .select("signup_id")
      .eq("event_id", eventIdInt)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing signup:", existingError);
    }

    if (existingSignup) {
      // User is confirmed for the event -> show Unsign Up
      signupBtn.disabled = false;
      signupBtn.textContent = "Unsign Up";
      signupBtn.classList.remove(
        "btn-primary",
        "btn-outline-primary",
        "btn-outline-secondary",
        "btn-success",
      );
      signupBtn.classList.add("btn-warning");
      signupStatus.textContent =
        "You are signed up. Click to remove yourself from this event.";

      signupBtn.onclick = async () => {
        await handleUnsignUpClick(signupBtn, signupStatus);
      };
      return;
    }

    // 2. Check waitlist entry for this user
    const { data: waitlistEntry, error: waitlistError } = await supabase
      .from("event_waitlist")
      .select(
        "waitlist_id, user_id, joined_at, promotion_offered, promotion_expires_at, promoted_at",
      )
      .eq("event_id", eventIdInt)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (waitlistError) {
      console.error("Error checking waitlist:", waitlistError);
    }

    // 3. Eligibility check based on visibility / CCA membership
    let isEligible = true;
    if (currentEvent.visibility === "cca-specific") {
      const { data: memberships, error: memError } = await supabase
        .from("cca_membership")
        .select("cca_id")
        .eq("user_id", currentUser.id);

      if (memError) {
        console.error("Error fetching CCA memberships:", memError);
        signupBtn.disabled = true;
        signupBtn.textContent = "Sign Up (Not Eligible)";
        signupStatus.textContent =
          "Unable to verify your CCA membership at the moment.";
        return;
      }

      const ccaIds =
        memberships && memberships.length
          ? memberships.map((m) => m.cca_id)
          : [];

      if (!ccaIds.includes(currentEvent.cca_id)) {
        isEligible = false;
      }
    }

    if (!isEligible) {
      // Not in the correct CCA
      signupBtn.disabled = true;
      signupBtn.textContent = "Sign Up (Not Eligible)";
      signupBtn.classList.remove(
        "btn-primary",
        "btn-warning",
        "btn-success",
        "btn-outline-primary",
      );
      signupBtn.classList.add("btn-outline-secondary");
      signupStatus.textContent =
        "Only members of this CCA are allowed to sign up for this event.";
      return;
    }

    // 4. Handle waitlist states (if user already in waitlist)
    if (waitlistEntry) {
      const infoBox = document.getElementById("waitlistInfoBox");
      const expiredText = document.getElementById("promotionExpired");
      const posSpan = document.getElementById("waitlistPosition");

      // Ensure info box visible
      if (infoBox) infoBox.style.display = "block";
      if (expiredText) expiredText.textContent = "";
      if (posSpan) posSpan.textContent = "";

      // 4a. Promotion offered?
      if (
        waitlistEntry.promotion_offered === true ||
        waitlistEntry.promotion_offered === "true" ||
        waitlistEntry.promotion_offered === 1
      ) {
        const now = new Date();
        const expiresAt = waitlistEntry.promotion_expires_at
          ? new Date(waitlistEntry.promotion_expires_at)
          : null;

        if (expiresAt && now < expiresAt) {
          // Active promotion window
          signupBtn.disabled = false;
          signupBtn.textContent = "Accept Spot";
          signupBtn.classList.remove(
            "btn-primary",
            "btn-warning",
            "btn-outline-primary",
            "btn-outline-secondary",
          );
          signupBtn.classList.add("btn-success");

          signupStatus.textContent = "You've been offered a spot!";
          startPromotionCountdown(waitlistEntry.promotion_expires_at);

          signupBtn.onclick = async () => {
            await handleAcceptPromotionClick(signupBtn, signupStatus);
          };
        } else {
          // Promotion expired – treat as still on waitlist, waiting again
          signupBtn.disabled = false;
          signupBtn.textContent = "On Waitlist";
          signupBtn.classList.remove(
            "btn-primary",
            "btn-warning",
            "btn-success",
            "btn-outline-primary",
          );
          signupBtn.classList.add("btn-outline-secondary");

          signupStatus.textContent =
            "Your previous offer expired. You're still on the waitlist and may be offered a spot again.";

          if (expiredText) {
            expiredText.textContent =
              "⚠️ Your previous promotion offer expired.";
          }

          signupBtn.onclick = async () => {
            await handleCancelWaitlistClick(signupBtn, signupStatus);
          };
        }

        return;
      }

      // 4b. Normal waitlist (no promotion yet): show position + allow leaving
      const { data: allWaitlist, error: allWaitlistError } = await supabase
        .from("event_waitlist")
        .select("waitlist_id, user_id, joined_at")
        .eq("event_id", eventIdInt)
        .order("joined_at", { ascending: true });

      if (allWaitlistError) {
        console.error("Error fetching full waitlist:", allWaitlistError);
      }

      let position = null;
      if (Array.isArray(allWaitlist)) {
        const idx = allWaitlist.findIndex((w) => w.user_id === currentUser.id);
        if (idx >= 0) position = idx + 1;
      }

      signupBtn.disabled = false;
      signupBtn.textContent = "Leave Waitlist";
      signupBtn.classList.remove(
        "btn-primary",
        "btn-warning",
        "btn-success",
        "btn-outline-primary",
      );
      signupBtn.classList.add("btn-outline-secondary");

      signupStatus.textContent = "You are on the waitlist.";

      if (infoBox) infoBox.style.display = "block";
      if (posSpan && position) {
        posSpan.textContent = `Your current position: #${position}`;
      }

      signupBtn.onclick = async () => {
        await handleCancelWaitlistClick(signupBtn, signupStatus);
      };
      return;
    }

    // 5. Not signed up and not on waitlist yet

    // If deadline passed, block new sign-ups / new waitlist joins
    if (deadlinePassed) {
      signupBtn.disabled = true;
      signupBtn.textContent = "Sign-up Closed";
      signupBtn.classList.remove(
        "btn-primary",
        "btn-warning",
        "btn-success",
        "btn-outline-primary",
        "btn-outline-secondary",
      );
      signupBtn.classList.add("btn-secondary");
      signupStatus.textContent = "The sign-up deadline has passed.";
      return;
    }

    // 6. Capacity check (if capacity is set)
    if (currentEvent.capacity && Number.isInteger(currentEvent.capacity)) {
      const { count, error: countError } = await supabase
        .from("event_signup")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventIdInt);

      if (countError) {
        console.error("Error checking event capacity:", countError);
      } else if (typeof count === "number" && count >= currentEvent.capacity) {
        // Event full -> show Join Waitlist
        signupBtn.disabled = false;
        signupBtn.textContent = "Join Waitlist";
        signupBtn.classList.remove(
          "btn-primary",
          "btn-warning",
          "btn-success",
          "btn-outline-secondary",
        );
        signupBtn.classList.add("btn-outline-primary");

        signupStatus.textContent =
          "This event is full. Join the waitlist to be notified if a spot opens.";

        signupBtn.onclick = async () => {
          await handleJoinWaitlistClick(signupBtn, signupStatus);
        };
        return;
      }
    }

    // 7. Spots available -> normal Sign Up
    signupBtn.disabled = false;
    signupBtn.textContent = "Sign Up";
    signupBtn.classList.remove(
      "btn-warning",
      "btn-success",
      "btn-outline-primary",
      "btn-outline-secondary",
    );
    signupBtn.classList.add("btn-primary");

    if (currentEvent.visibility === "poly-wide") {
      signupStatus.textContent = "Open to all students (poly-wide event).";
    } else {
      signupStatus.textContent =
        "You are a member of this CCA. You may sign up for this event.";
    }

    signupBtn.onclick = async () => {
      await handleSignUpClick(signupBtn, signupStatus);
    };
  } catch (err) {
    console.error("Error updating signup state:", err);
    signupBtn.disabled = true;
    signupStatus.textContent =
      "There was a problem determining your sign-up state. Please try again later.";
  }
}

// ======================================================
// BACKEND-AWARE HANDLERS
// ======================================================

async function handleSignUpClick(signupBtn, signupStatus) {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  // Check if user is EXCO of this event's CCA
  const isExcoOfEventCCA = userCCAMemberships.some(
    (m) =>
      m.cca_id === currentEvent.cca_id &&
      m.role?.toLowerCase().includes("exco"),
  );

  if (isExcoOfEventCCA) {
    showToast(
      "Cannot Sign Up",
      "EXCO members cannot sign up for their own CCA's events.",
      "warning",
    );
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Processing...";

  try {
    // ❗ Normal direct sign-up goes through events endpoint
    const res = await fetch("/api/events/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        user_id: currentUser.id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Sign-up error:", json);
      signupStatus.textContent =
        json.error || "There was a problem signing you up.";
      signupBtn.disabled = false;
      signupBtn.textContent = "Sign Up";

      if (typeof showToast === "function") {
        showToast("Sign-up failed", json.error || "Please try again.", "error");
      }
      return;
    }

    if (typeof showToast === "function") {
      showToast(
        "Signed up",
        json.message || "You are now signed up for this event.",
        "success",
      );
    }

    await updateSignupState(signupBtn, signupStatus);
  } catch (err) {
    console.error("Unexpected sign-up error:", err);
    signupBtn.disabled = false;
    signupBtn.textContent = "Sign Up";
    signupStatus.textContent =
      "There was a problem signing you up. Please try again.";

    if (typeof showToast === "function") {
      showToast(
        "Sign-up failed",
        "Unexpected error occurred. Please try again.",
        "error",
      );
    }
  }
}

async function handleJoinWaitlistClick(signupBtn, signupStatus) {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Joining waitlist...";

  try {
    const res = await fetch("/api/waitlist/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        user_id: currentUser.id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Join waitlist error:", json);
      signupStatus.textContent =
        json.error || "There was a problem joining the waitlist.";
      signupBtn.disabled = false;
      signupBtn.textContent = "Join Waitlist";

      if (typeof showToast === "function") {
        showToast(
          "Waitlist join failed",
          json.error || "Please try again.",
          "error",
        );
      }
      return;
    }

    if (typeof showToast === "function") {
      showToast(
        "Joined waitlist",
        json.message || "You have been added to the waitlist.",
        "success",
      );
    }

    await updateSignupState(signupBtn, signupStatus);
  } catch (err) {
    console.error("Unexpected waitlist join error:", err);
    signupBtn.disabled = false;
    signupBtn.textContent = "Join Waitlist";
    signupStatus.textContent =
      "There was a problem joining the waitlist. Please try again.";

    if (typeof showToast === "function") {
      showToast(
        "Waitlist join failed",
        "Unexpected error occurred. Please try again.",
        "error",
      );
    }
  }
}

async function handleCancelWaitlistClick(signupBtn, signupStatus) {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  if (!confirm("Are you sure you want to leave the waitlist?")) {
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Removing...";

  try {
    const res = await fetch("/api/waitlist/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        user_id: currentUser.id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Cancel waitlist error:", json);
      signupStatus.textContent =
        json.error || "There was a problem leaving the waitlist.";
      signupBtn.disabled = false;
      signupBtn.textContent = "Leave Waitlist";

      if (typeof showToast === "function") {
        showToast(
          "Waitlist removal failed",
          json.error || "Please try again.",
          "error",
        );
      }
      return;
    }

    if (typeof showToast === "function") {
      showToast("Waitlist updated", "You have left the waitlist.", "success");
    }

    await updateSignupState(signupBtn, signupStatus);
  } catch (err) {
    console.error("Unexpected cancel waitlist error:", err);
    signupBtn.disabled = false;
    signupBtn.textContent = "Leave Waitlist";
    signupStatus.textContent =
      "There was a problem leaving the waitlist. Please try again.";

    if (typeof showToast === "function") {
      showToast(
        "Waitlist removal failed",
        "Unexpected error occurred. Please try again.",
        "error",
      );
    }
  }
}

async function handleAcceptPromotionClick(signupBtn, signupStatus) {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Accepting...";

  try {
    const res = await fetch("/api/waitlist/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        user_id: currentUser.id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Accept promotion error:", json);
      signupStatus.textContent =
        json.error || "There was a problem accepting your spot.";
      signupBtn.disabled = false;
      signupBtn.textContent = "Accept Spot";

      if (typeof showToast === "function") {
        showToast(
          "Promotion accept failed",
          json.error || "Please try again.",
          "error",
        );
      }
      return;
    }

    if (typeof showToast === "function") {
      showToast(
        "Spot confirmed",
        json.message || "You are now confirmed for this event.",
        "success",
      );
    }

    await updateSignupState(signupBtn, signupStatus);
  } catch (err) {
    console.error("Unexpected promotion accept error:", err);
    signupBtn.disabled = false;
    signupBtn.textContent = "Accept Spot";
    signupStatus.textContent =
      "There was a problem accepting your spot. Please try again.";

    if (typeof showToast === "function") {
      showToast(
        "Promotion accept failed",
        "Unexpected error occurred. Please try again.",
        "error",
      );
    }
  }
}

async function handleUnsignUpClick(signupBtn, signupStatus) {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  if (!confirm("Are you sure you want to remove yourself from this event?")) {
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "Removing...";

  try {
    const res = await fetch("/api/waitlist/unsign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_id: parseInt(eventId, 10),
        user_id: currentUser.id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Unsign error:", json);
      signupStatus.textContent =
        json.error || "There was a problem removing you from this event.";
      signupBtn.disabled = false;
      signupBtn.textContent = "Unsign Up";

      if (typeof showToast === "function") {
        showToast("Unsign failed", json.error || "Please try again.", "error");
      }
      return;
    }

    if (typeof showToast === "function") {
      showToast(
        "Removed",
        json.message ||
          "You have been removed from this event. If there's a waitlist, the next person may be promoted.",
        "success",
      );
    }

    await updateSignupState(signupBtn, signupStatus);
  } catch (err) {
    console.error("Unexpected unsign error:", err);
    signupBtn.disabled = false;
    signupBtn.textContent = "Unsign Up";
    signupStatus.textContent =
      "There was a problem removing you from this event. Please try again.";

    if (typeof showToast === "function") {
      showToast(
        "Unsign failed",
        "Unexpected error occurred. Please try again.",
        "error",
      );
    }
  }
}

// ======================================================
// PROMOTION COUNTDOWN (single, final version)
// ======================================================
function startPromotionCountdown(expiresAtIso) {
  const promoBox = document.getElementById("waitlistInfoBox");
  const timer = document.getElementById("promotionTimer");
  const expiredMsg = document.getElementById("promotionExpired");

  if (!promoBox || !timer) return;
  promoBox.style.display = "block";
  if (expiredMsg) expiredMsg.textContent = "";
  timer.textContent = "";

  const expiresAt = new Date(expiresAtIso);

  if (promoTimerInterval) clearInterval(promoTimerInterval);

  promoTimerInterval = setInterval(() => {
    const now = new Date();
    const diff = expiresAt - now;

    if (diff <= 0) {
      clearInterval(promoTimerInterval);
      timer.textContent = "";
      if (expiredMsg) {
        expiredMsg.textContent = "⚠️ Your promotion offer has expired.";
      }

      // Re-evaluate state after expiry
      const signupBtn = document.getElementById("signupBtn");
      const signupStatus = document.getElementById("signupStatus");
      if (signupBtn && signupStatus) {
        updateSignupState(signupBtn, signupStatus);
      }
      return;
    }

    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);

    timer.textContent = `⏳ Promotion expires in ${min}m ${sec}s`;
  }, 1000);
}

// ======================================================
// REALTIME: event_signup + event_waitlist for THIS event
// ======================================================
function setupEventRealtime() {
  if (!window.supabase || !eventId) return;

  const signupBtn = document.getElementById("signupBtn");
  const signupStatus = document.getElementById("signupStatus");

  if (!signupBtn || !signupStatus) return;

  // Clean up previous channel if any
  if (eventRealtimeChannel) {
    supabase.removeChannel(eventRealtimeChannel);
  }

  eventRealtimeChannel = supabase
    .channel(`event_realtime_${eventId}`)
    // 🔹 When signups change (someone signs up / unsigns)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_signup",
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        console.log("Realtime: event_signup changed:", payload);
        updateSignupState(signupBtn, signupStatus);
      },
    )
    // 🔹 When waitlist changes (join, cancel, promotion, expiry)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_waitlist",
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        console.log("Realtime: event_waitlist changed:", payload);
        updateSignupState(signupBtn, signupStatus);

        if (typeof refreshWaitlistUI === "function") {
          refreshWaitlistUI();
        }
      },
    )
    // 🔹 Monitor the event status itself (in case teacher approves it live)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "event",
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        if (payload.new.status !== payload.old.status) {
          console.log("Event status changed!", payload.new.status);
          location.reload();
        }
      },
    )
    .subscribe((status) => {
      console.log("Event realtime channel status:", status);
    });
}

// Optional cleanup
window.addEventListener("beforeunload", () => {
  if (eventRealtimeChannel) {
    supabase.removeChannel(eventRealtimeChannel);
  }
  if (promoTimerInterval) {
    clearInterval(promoTimerInterval);
  }
});
