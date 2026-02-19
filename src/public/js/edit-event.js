// ============================
// EDIT + DELETE EVENT LOGIC
// ============================

const editBtnContainer = document.createElement("div");
editBtnContainer.className = "mt-3 d-flex";

let canManage = false;

// ✅ Image preview in edit modal
document.getElementById("editEventImage")?.addEventListener("change", (e) => {
  const preview = document.getElementById("editEventImagePreview");
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

// ✅ Show Edit Button for EXCO of same CCA
async function checkManagementRights() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) return;

    const json = await res.json();
    if (json.user.role !== "exco") return;

    // ✅ Fetch user's CCA
    const { data: membership } = await supabase
      .from("cca_membership")
      .select("cca_id")
      .eq("user_id", json.user.id)
      .single();

    if (membership && currentEvent.cca_id === membership.cca_id) {
      canManage = true;
      renderEditButton();
    }
  } catch (err) {
    console.error(err);
  }
}

function renderEditButton() {
  if (!canManage) return;

  editBtnContainer.innerHTML = `
    <button id="openEditModalBtn" class="btn btn-warning">
      <i class="bi bi-pencil"></i> Edit Event
    </button>
  `;

  // Place edit button in the same flex container as signup/QR code (find the parent flex div)
  const signupSection = document.querySelector(
    ".d-flex.align-items-center.justify-content-between",
  );
  if (signupSection) {
    signupSection.appendChild(editBtnContainer);
  } else {
    // Fallback: append to card-body
    document
      .querySelector("#eventContent .card-body")
      ?.appendChild(editBtnContainer);
  }

  document
    .getElementById("openEditModalBtn")
    .addEventListener("click", openEditModal);
}

// ✅ Open modal + prefill all values
function openEditModal() {
  document.getElementById("editEventTitle").value = currentEvent.title;
  document.getElementById("editEventDescription").value =
    currentEvent.description || "";
  document.getElementById("editEventVisibility").value =
    currentEvent.visibility;
  document.getElementById("editEventStart").value =
    currentEvent.start_datetime.slice(0, 16);
  document.getElementById("editEventEnd").value =
    currentEvent.end_datetime.slice(0, 16);
  document.getElementById("editEventLocation").value =
    currentEvent.location || "";
  document.getElementById("editEventCapacity").value =
    currentEvent.capacity || 1;
  document.getElementById("editEventPointsCategory").value =
    currentEvent.cca_points_category || "";
  // Note: editEventImage is a file input — leave empty to keep existing image
  document.getElementById("editEventSignUpDeadline").value =
    currentEvent.sign_up_deadline
      ? currentEvent.sign_up_deadline.slice(0, 16)
      : "";
  document.getElementById("editEventCcaPoints").value =
    currentEvent.cca_points || "";

  // ✅ NEW FIELDS
  document.getElementById("editEventAgenda").value = currentEvent.agenda || "";
  document.getElementById("editEventRequirements").value =
    currentEvent.requirements || "";
  document.getElementById("editEventSafety").value =
    currentEvent.safety_guidelines || "";
  document.getElementById("editEventNotes").value = currentEvent.notes || "";
  document.getElementById("editEventContactPerson").value =
    currentEvent.contact_person || "";
  document.getElementById("editEventContactEmail").value =
    currentEvent.contact_email || "";
  document.getElementById("editEventContactPhone").value =
    currentEvent.contact_phone || "";

  const modal = new bootstrap.Modal(document.getElementById("editEventModal"));
  modal.show();
}

// ✅ Save changes
document
  .getElementById("saveEventChangesBtn")
  .addEventListener("click", async () => {
    const updatedEvent = {
      title: document.getElementById("editEventTitle").value,
      description: document.getElementById("editEventDescription").value,
      visibility: document.getElementById("editEventVisibility").value,
      start_datetime: document.getElementById("editEventStart").value,
      end_datetime: document.getElementById("editEventEnd").value,
      location: document.getElementById("editEventLocation").value,
      capacity: Number(document.getElementById("editEventCapacity").value),
      cca_points_category: document.getElementById("editEventPointsCategory")
        .value,
      image_path: null, // will be set to uploaded URL or kept as current
      sign_up_deadline:
        document.getElementById("editEventSignUpDeadline").value || null,
      cca_points: document.getElementById("editEventCcaPoints").value
        ? parseInt(document.getElementById("editEventCcaPoints").value, 10)
        : null,

      // ✅ NEW FIELDS SENT TO BACKEND
      agenda: document.getElementById("editEventAgenda").value,
      requirements: document.getElementById("editEventRequirements").value,
      safety_guidelines: document.getElementById("editEventSafety").value,
      notes: document.getElementById("editEventNotes").value,
      contact_person: document.getElementById("editEventContactPerson").value,
      contact_email: document.getElementById("editEventContactEmail").value,
      contact_phone: document.getElementById("editEventContactPhone").value,
    };

    // ===== VALIDATION =====

    // 1) Start date must not be earlier than current time
    const now = new Date();
    const startDate = new Date(updatedEvent.start_datetime);
    if (startDate < now) {
      alert("Event start date cannot be earlier than the current time.");
      return;
    }

    // 2) End date must not be earlier than current time
    const endDate = new Date(updatedEvent.end_datetime);
    if (endDate < now) {
      alert("Event end date cannot be earlier than the current time.");
      return;
    }

    // 3) End date must be after start date
    if (endDate <= startDate) {
      alert("Event end date must be after the start date.");
      return;
    }

    // 4) Validation: sign_up_deadline must be before event start
    if (updatedEvent.sign_up_deadline) {
      const ddl = new Date(updatedEvent.sign_up_deadline);
      if (ddl >= startDate) {
        alert("Sign-up deadline must be before the event start time.");
        return;
      }
    }

    // If a new image file is chosen, upload it to server first
    const editImageInput = document.getElementById("editEventImage");
    if (
      editImageInput &&
      editImageInput.files &&
      editImageInput.files.length > 0
    ) {
      const file = editImageInput.files[0];
      try {
        const form = new FormData();
        form.append("image", file);

        const uploadRes = await fetch("/api/events/upload-image", {
          method: "POST",
          body: form,
          credentials: "include",
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          console.error("Server image upload failed:", uploadJson);
          alert("Failed to upload image. Please try again.");
          return;
        }

        updatedEvent.image_path = uploadJson.publicUrl;
      } catch (err) {
        console.error("Image upload failed:", err);
        alert("Image upload failed. Please try again.");
        return;
      }
    } else {
      // Keep existing image path if no new file
      updatedEvent.image_path = currentEvent.image_path || null;
    }

    // ==========================================
    // FINAL COMPULSORY IMAGE VALIDATION
    // ==========================================
    // If no new image was uploaded AND there is no existing path, block submission.
    if (!updatedEvent.image_path) {
      alert(
        "This event requires an image. Please upload a file or ensure a preset is selected.",
      );
      return;
    }

    const res = await fetch(`/api/events/${eventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updatedEvent),
    });

    const json = await res.json();

    if (!res.ok) {
      alert("Error: " + json.error);
      return;
    }

    // ✅ Create notification for EXCO
    const excoRes = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (excoRes.ok) {
      const excoJson = await excoRes.json();
      if (typeof notifyExcoEventEdited === "function") {
        await notifyExcoEventEdited(excoJson.user.id, json.updatedEvent);
      }
    }

    alert("Event updated!");
    location.reload();
  });

// ✅ Delete event
document
  .getElementById("deleteEventBtn")
  .addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    const res = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json();

    if (!res.ok) {
      alert("Error: " + json.error);
      return;
    }

    alert("Event deleted.");
    window.location.href = "dashboard.html";
  });

// ✅ Init
document.addEventListener("DOMContentLoaded", async () => {
  // Wait until event-details.js finishes loading currentEvent
  while (!currentEvent) {
    await new Promise((r) => setTimeout(r, 100));
  }
  checkManagementRights();
});
