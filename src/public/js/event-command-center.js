// src/public/event-command-center.js
async function getJSON(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Command Center error: ${msg || res.statusText} (${url})`);
  }
  return res.json();
}

function fmt(num) {
  return new Intl.NumberFormat().format(num || 0);
}

let eventChart;
let currentEventId = null;
let participantsData = [];
let feedbackComments = [];

async function initCommandCenter() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event_id");

  console.log("URL search string:", window.location.search);
  console.log("Event ID extracted:", eventId);

  if (!eventId || eventId === "undefined" || eventId === "null") {
    document.getElementById("eventTitle").textContent = "Event ID Missing";
    document.getElementById("eventMeta").innerHTML =
      `<i class="bi bi-exclamation-triangle me-2"></i>Please navigate to this page from the Analytics dashboard.`;
    document.getElementById("statSignups").textContent = "0";
    document.getElementById("statAttended").textContent = "0";
    document.getElementById("statRate").textContent = "0%";

    const qrLink = document.getElementById("qrLink");
    if (qrLink) {
      qrLink.classList.add("disabled");
      qrLink.removeAttribute("href");
    }

    return;
  }

  currentEventId = eventId;

  try {
    const me = await getJSON("/api/analytics/my-cca");
    const ccaId = me.cca_id;

    const data = await getJSON(
      `/api/analytics/top-events?cca_id=${ccaId}&limit=1000`,
    );
    console.log("All events data:", data);

    const event = data.events.find(
      (e) => String(e.event_id) === String(eventId),
    );

    if (!event) {
      document.getElementById("eventTitle").textContent = "Event Not Found";
      document.getElementById("eventMeta").innerHTML =
        `<i class="bi bi-search me-2"></i>Event ID "${eventId}" not found in your CCA records.`;
      return;
    }

    console.log("Found event:", event);

    // UI Updates
    document.getElementById("eventTitle").textContent =
      event.title || "Untitled Event";
    const eventDate = new Date(event.date).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    document.getElementById("eventMeta").innerHTML =
      `<i class="bi bi-calendar-event me-2"></i>${eventDate}`;

    document.getElementById("statSignups").textContent = fmt(event.signups);
    document.getElementById("statAttended").textContent = fmt(event.attended);

    const rate =
      event.signups > 0
        ? Math.round((event.attended / event.signups) * 100)
        : 0;
    document.getElementById("statRate").textContent = `${rate}%`;

    const qrLink = document.getElementById("qrLink");
    if (qrLink) {
      qrLink.href = `qr-scanner.html?event_id=${eventId}`;
      qrLink.classList.remove("disabled");
    }

    // Update modal title
    document.getElementById("modalEventTitle").textContent =
      event.title || "Untitled Event";
    document.getElementById("modalEventDate").textContent =
      `Event Date: ${eventDate}`;

    // Update email subject
    const emailSubject = document.getElementById("emailSubject");
    if (emailSubject) {
      emailSubject.value = `Regarding: ${event.title || "Event"}`;
    }

    // Charting
    const ctx = document
      .getElementById("eventAttendanceChart")
      .getContext("2d");
    const noShow = Math.max(0, event.signups - event.attended);

    if (eventChart) eventChart.destroy();
    eventChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Attended", "No-Show"],
        datasets: [
          {
            data: [event.attended, noShow],
            backgroundColor: ["#d8292f", "#f8f9fa"],
            borderColor: ["#d8292f", "#dee2e6"],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              padding: 20,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const label = context.label || "";
                const value = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage =
                  total > 0 ? Math.round((value / total) * 100) : 0;
                return `${label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
      },
    });

    loadFeedbackAnalysis(currentEventId);
  } catch (err) {
    console.error("Command Center Error:", err);
    document.getElementById("eventTitle").textContent = "Error Loading Event";
    document.getElementById("eventMeta").innerHTML =
      `<i class="bi bi-exclamation-circle me-2"></i>Failed to load event details. Please try again later.`;
  }
}

// Email Participants Functions
async function showParticipantsModal() {
  if (!currentEventId) {
    alert("Please wait for event data to load.");
    return;
  }

  try {
    const modal = new bootstrap.Modal(
      document.getElementById("participantsModal"),
    );
    modal.show();

    // Load participants data
    await loadParticipants();
  } catch (error) {
    console.error("Error showing participants modal:", error);
    alert("Failed to load participants. Please try again.");
  }
}

async function loadParticipants() {
  if (!currentEventId) return;

  const tbody = document.getElementById("participantsTableBody");
  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center py-4">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
        Loading participants...
      </td>
    </tr>
  `;

  try {
    // Use the correct API endpoint (matches your router)
    console.log(`Fetching participants for event ${currentEventId}...`);
    const data = await getJSON(`/api/command/${currentEventId}/participants`);
    participantsData = data.participants || [];

    console.log("Participants data received:", participantsData);

    if (participantsData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-muted">
            <i class="bi bi-people display-6 d-block mb-2"></i>
            No participants found for this event.
          </td>
        </tr>
      `;
      return;
    }

    // Populate the table
    tbody.innerHTML = "";
    participantsData.forEach((participant, index) => {
      const row = document.createElement("tr");
      const signedUpDate = participant.signed_up
        ? new Date(participant.signed_up).toLocaleDateString()
        : "Unknown";

      // Determine status badge
      let statusBadge = "bg-secondary";
      let statusText = "Registered";

      if (participant.attended) {
        statusBadge = "bg-success";
        statusText = "Attended";
      } else if (participant.status === "present") {
        statusBadge = "bg-success";
        statusText = "Present";
      } else if (participant.status === "absent") {
        statusBadge = "bg-danger";
        statusText = "Absent";
      } else if (participant.status === "waitlisted") {
        statusBadge = "bg-warning text-dark";
        statusText = "Waitlisted";
      } else if (participant.status === "checked_in") {
        statusBadge = "bg-info";
        statusText = "Checked In";
      }

      row.innerHTML = `
        <td>
          <input type="checkbox" class="participant-checkbox" value="${participant.user_id || participant.signup_id || index}" 
                 data-email="${participant.email || ""}" data-name="${participant.name || ""}">
        </td>
        <td>${participant.name || "Unknown"}</td>
        <td>${participant.email || "No email"}</td>
        <td>
          <span class="badge ${statusBadge}">
            ${statusText}
          </span>
        </td>
        <td>${signedUpDate}</td>
      `;
      tbody.appendChild(row);
    });

    // Update email template with event info
    const eventTitle = document.getElementById("eventTitle").textContent;
    const eventMeta = document.getElementById("eventMeta").textContent;
    const template = document.getElementById("emailTemplate");
    const emailSubject = document.getElementById("emailSubject");

    // Extract just the date from eventMeta
    const eventDateMatch = eventMeta.match(
      /[A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}/,
    );
    const eventDate = eventDateMatch
      ? eventDateMatch[0]
      : eventMeta.replace("Event Date: ", "");

    // Update subject if exists
    if (emailSubject) {
      emailSubject.value = `Regarding: ${eventTitle}`;
    }

    // Set default template if empty
    if (!template.value.trim()) {
      template.value = `Hi [Name],

This is regarding your registration for "${eventTitle}" on ${eventDate}.

Best regards,
Evently Team`;
    } else {
      // Update placeholders in existing template
      template.value = template.value
        .replace(/\[Event Name\]/g, eventTitle)
        .replace(/\[Event Date\]/g, eventDate);
    }
  } catch (error) {
    console.error("Error loading participants:", error);
    let displayMsg = error.message;
    if (error.message.includes("500")) {
      displayMsg +=
        "<br><small>(Backend error – check server terminal logs for details)</small>";
    } else if (
      error.message.includes("table") ||
      error.message.includes("schema cache")
    ) {
      displayMsg +=
        "<br><small>(Database table issue - check Supabase table names)</small>";
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load participants: ${displayMsg}
          <br><small class="text-muted">Check browser console and server logs</small>
        </td>
      </tr>
    `;
  }
}

function toggleSelectAll(checkbox) {
  const checkboxes = document.querySelectorAll(".participant-checkbox");
  checkboxes.forEach((cb) => (cb.checked = checkbox.checked));
}

function selectAllParticipants() {
  const checkbox = document.getElementById("selectAllCheckbox");
  checkbox.checked = !checkbox.checked;
  toggleSelectAll(checkbox);
}

function useReminderTemplate() {
  const eventTitle = document.getElementById("eventTitle").textContent;
  const eventMeta = document.getElementById("eventMeta").textContent;
  const template = document.getElementById("emailTemplate");
  const emailSubject = document.getElementById("emailSubject");

  // Extract just the date from eventMeta
  const eventDateMatch = eventMeta.match(/[A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}/);
  const eventDate = eventDateMatch
    ? eventDateMatch[0]
    : eventMeta.replace("Event Date: ", "");

  template.value = `Dear [Name],

This is a friendly reminder about the upcoming event:

Event: ${eventTitle}
Date: ${eventDate}

Please remember to attend and bring any necessary materials.

Looking forward to seeing you there!

Best regards,
Evently Team`;

  if (emailSubject) {
    emailSubject.value = `Reminder: ${eventTitle} - ${eventDate}`;
  }
}

function useThankYouTemplate() {
  const eventTitle = document.getElementById("eventTitle").textContent;
  const template = document.getElementById("emailTemplate");
  const emailSubject = document.getElementById("emailSubject");

  template.value = `Dear [Name],

Thank you for attending "${eventTitle}"!

We hope you found the event informative and enjoyable. Your participation is greatly appreciated.

If you have any feedback about the event, please don't hesitate to share it with us.

Best regards,
Evently Team`;

  if (emailSubject) {
    emailSubject.value = `Thank You for Attending ${eventTitle}`;
  }
}

function useFollowUpTemplate() {
  const eventTitle = document.getElementById("eventTitle").textContent;
  const template = document.getElementById("emailTemplate");
  const emailSubject = document.getElementById("emailSubject");

  template.value = `Dear [Name],

Following up on "${eventTitle}" that you recently attended.

We would appreciate your feedback through our short survey: [Survey Link]

Your input helps us improve future events.

Thank you for your time!

Best regards,
Evently Team`;

  if (emailSubject) {
    emailSubject.value = `Follow-up: ${eventTitle} Feedback Request`;
  }
}

// ───────────────────────────────────────────────
// RPA FRONTEND LOGIC (Updated to handle report)
// ───────────────────────────────────────────────
async function sendEmailToSelected() {
  const checkboxes = document.querySelectorAll(".participant-checkbox:checked");
  const template = document.getElementById("emailTemplate").value;
  const emailSubject = document.getElementById("emailSubject");
  const subject = emailSubject
    ? emailSubject.value
    : `Regarding: ${document.getElementById("eventTitle").textContent}`;

  if (checkboxes.length === 0) {
    alert("Please select at least one participant to email.");
    return;
  }

  const participants = [];
  checkboxes.forEach((cb) => {
    participants.push({
      name: cb.getAttribute("data-name") || "Participant",
      email: cb.getAttribute("data-email"),
    });
  });

  // UI Feedback: Change button to loading state
  const sendBtn = document.querySelector("#participantsModal .btn-primary");
  const originalText = sendBtn ? sendBtn.innerHTML : "Send Email";
  if (sendBtn) {
    sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Sending...`;
    sendBtn.disabled = true;
  }

  try {
    // Send email request to the RPA endpoint
    const response = await fetch(`/api/command/${currentEventId}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        participants: participants,
        template: template,
        subject: subject,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      // Handle the detailed RPA Report
      if (result.failed_count === 0) {
        // Case A: Perfect Success
        alert(
          `✅ Success! All ${result.sent_count} emails have been sent successfully.`,
        );
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("participantsModal"),
        );
        modal.hide();
      } else {
        // Case B: Partial Failure (Invalid emails, etc.)
        let msg = `⚠️ Finished with errors.\n\n`;
        msg += `✅ Sent: ${result.sent_count}\n`;
        msg += `❌ Failed: ${result.failed_count}\n\n`;
        msg += `Failed Recipients:\n`;

        result.failures.forEach((f) => {
          msg += `- ${f.name} (${f.email}): ${f.reason}\n`;
        });

        alert(msg);
        // We do NOT close the modal so you can see who failed and try again
      }
    } else {
      throw new Error(result.error || "Failed to send email");
    }
  } catch (error) {
    console.error("Error sending email:", error);
    alert(`Failed to send email: ${error.message}`);
  } finally {
    // Restore button state
    if (sendBtn) {
      sendBtn.innerHTML = originalText;
      sendBtn.disabled = false;
    }
  }
}

async function exportAttendanceList() {
  if (!currentEventId) {
    alert("No event data available.");
    return;
  }

  // Try to reload data if empty
  if (participantsData.length === 0) {
    try {
      console.log("No participants data cached, loading from API...");
      const response = await getJSON(
        `/api/command/${currentEventId}/participants`,
      );
      participantsData = response.participants || [];

      if (participantsData.length === 0) {
        alert("No participant data available to export.");
        return;
      }
    } catch (error) {
      console.error("Error loading participants for export:", error);
      alert("Failed to load participant data. Please try again.");
      return;
    }
  }

  // Generate PDF instead of CSV
  generatePDFReport();
}

async function generatePDFReport() {
  if (!currentEventId) return;

  try {
    // Show loading message
    const exportBtn = document.querySelector(
      'button[onclick*="exportAttendanceList"]',
    );
    const originalText = exportBtn?.innerHTML;

    if (exportBtn) {
      exportBtn.innerHTML =
        '<i class="bi bi-hourglass-split me-2"></i>Generating PDF...';
      exportBtn.disabled = true;
    }

    // Request PDF from server
    const response = await fetch(`/api/command/${currentEventId}/export-pdf`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to generate PDF: ${response.statusText}`);
    }

    // Create blob from response
    const blob = await response.blob();

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Generate filename
    const eventTitle = document.getElementById("eventTitle").textContent;
    const safeTitle = eventTitle.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_");
    const dateStr = new Date().toISOString().split("T")[0];
    a.download = `SP_Evently_Attendance_${safeTitle}_${dateStr}.pdf`;

    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up
    window.URL.revokeObjectURL(url);

    console.log("PDF report generated successfully!");

    // Show success message
    alert(`✓ Attendance report PDF generated successfully!`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert(`Failed to generate PDF: ${error.message}`);
  } finally {
    // Restore button
    const exportBtn = document.querySelector(
      'button[onclick*="exportAttendanceList"]',
    );
    if (exportBtn) {
      exportBtn.innerHTML =
        '<i class="bi bi-file-earmark-pdf me-2 text-danger"></i> Export Attendance List';
      exportBtn.disabled = false;
    }
  }
}

async function loadFeedbackAnalysis(eventId) {
  try {
    const res = await fetch(`/api/command/analysis/${eventId}`);
    const result = await res.json();

    console.log("Feedback analysis data:", result);

    if (!result.success || !result.data.stats) {
      document.getElementById("statAvgRating").innerText = "N/A";
      return;
    }

    const { stats, comments } = result.data;

    feedbackComments = comments || [];

    // 1. Update Numeric Stats
    document.getElementById("statAvgRating").innerText = stats.average;
    document.getElementById("totalFeedbackCount").innerText =
      `${stats.totalResponses} responses`;

    // 2. Render Stars
    renderStars(stats.average);

    // 3. Render the Distribution Chart
    renderFeedbackChart(stats.distribution);
  } catch (err) {
    console.error("Error loading feedback:", err);
  }
}

// Helper: Draw Star Icons
function renderStars(rating) {
  const container = document.getElementById("starRatingContainer");
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  let html = "";

  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      html += '<i class="bi bi-star-fill mx-1 text-warning"></i>';
    } else if (i === fullStars + 1 && hasHalfStar) {
      html += '<i class="bi bi-star-half mx-1 text-warning"></i>';
    } else {
      html += '<i class="bi bi-star mx-1 text-muted"></i>';
    }
  }
  container.innerHTML = html;
}

// Helper: Initialize Chart.js
function renderFeedbackChart(distribution) {
  const ctx = document
    .getElementById("feedbackDistributionChart")
    .getContext("2d");

  // Labels are 1 to 5 stars, data is the count for each
  const labels = ["1 Star", "2 Stars", "3 Stars", "4 Stars", "5 Stars"];
  const dataValues = [
    distribution[1] || 0,
    distribution[2] || 0,
    distribution[3] || 0,
    distribution[4] || 0,
    distribution[5] || 0,
  ];

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Number of Responses",
          data: dataValues,
          backgroundColor: "#0d6efd",
          borderRadius: 5,
        },
      ],
    },
    options: {
      indexAxis: "y", // Makes it a horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

// Open Modal and Render Comments
function viewAllComments() {
  const listContainer = document.getElementById("feedbackList");
  const countLabel = document.getElementById("feedbackCount");

  // Update count label
  countLabel.textContent = `${feedbackComments.length} comments found`;

  // Clear previous content
  listContainer.innerHTML = "";

  if (!feedbackComments || feedbackComments.length === 0) {
    listContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-chat-square-dots fs-1 d-block mb-2"></i>
                No comments available for this event.
            </div>`;
  } else {
    feedbackComments.forEach((item) => {
      console.log("Rendering comment:", item);
      // Format Date (e.g., "12 Dec 2025")
      const dateStr = new Date(item.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      // Generate Star Icons for this specific comment
      let starsHtml = "";
      for (let i = 1; i <= 5; i++) {
        starsHtml +=
          i <= item.rating
            ? '<i class="bi bi-star-fill text-warning small"></i>'
            : '<i class="bi bi-star text-muted small" style="opacity: 0.3"></i>';
      }

      // Create List Item
      const li = document.createElement("div");
      li.className = "list-group-item px-0 py-3";
      li.innerHTML = `
                <div class="d-flex align-items-start gap-3">
                    <div class="flex-shrink-0">
                         <div class="rounded-circle bg-light d-flex align-items-center justify-content-center fw-bold text-primary" style="width: 40px; height: 40px;">
                                ${item.User?.name?.charAt(0) || "U"}
                               </div>
                        
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="mb-0 fw-bold">${item.User?.name || "Anonymous"}</h6>
                            <span class="text-muted small">${dateStr}</span>
                        </div>
                        <div class="mb-2">${starsHtml}</div>
                        <p class="mb-0 text-dark" style="font-size: 0.95rem;">
                            ${item.comment ? item.comment : '<em class="text-muted">No written comment.</em>'}
                        </p>
                    </div>
                </div>
            `;
      listContainer.appendChild(li);
    });
  }

  // Show the modal using Bootstrap API
  const modal = new bootstrap.Modal(document.getElementById("feedbackModal"));
  modal.show();
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", initCommandCenter);
