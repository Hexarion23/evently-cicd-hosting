// Make sure your page includes bootstrap toasts and cookie token available
let html5QrcodeScanner;
let isScanning = false;
let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  const startBtn = document.getElementById("startScanBtn");
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScanning) {
      stopScanning();
    } else {
      startScanning();
    }
  });

  // Fetch current user and load past scans
  await fetchCurrentUser();
  await loadPastScans();
});

async function startScanning() {
  isScanning = true;
  document.getElementById("scanBtnText").textContent = "Scanning...";
  document.getElementById("cameraIcon").classList.add("d-none");
  document.getElementById("qrIcon").classList.remove("d-none");

  const scannerBox = document.getElementById("scannerBox");
  scannerBox.innerHTML = '<div id="reader" style="width:100%"></div>';

  // Stop any existing scanner first
  if (html5QrcodeScanner) {
    try {
      await html5QrcodeScanner.stop();
      html5QrcodeScanner.clear();
      html5QrcodeScanner = null;
    } catch (e) {
      console.warn("Error cleaning up previous scanner:", e);
    }
  }

  // create new instance
  html5QrcodeScanner = new Html5Qrcode("reader");

  const config = { fps: 10, qrbox: { width: 300, height: 300 } };

  try {
    await html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      qrCodeSuccessCallback,
      qrCodeErrorCallback
    );
  } catch (err) {
    console.error("Camera start error:", err);
    showToast(
      "Camera Error",
      "Unable to access camera. Check permissions.",
      "danger"
    );
    stopScanning();
  }
}

function stopScanning() {
  isScanning = false;
  document.getElementById("scanBtnText").textContent = "Start Scanning";
  document.getElementById("cameraIcon").classList.remove("d-none");
  document.getElementById("qrIcon").classList.add("d-none");

  const scannerBox = document.getElementById("scannerBox");
  if (html5QrcodeScanner) {
    html5QrcodeScanner
      .stop()
      .then(() => {
        console.log("Camera stopped successfully");
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
      })
      .catch((e) => {
        console.error("Error stopping camera:", e);
      });
  }
  // restore placeholder icons
  scannerBox.innerHTML = `
    <i class="bi bi-camera display-1 text-muted" id="cameraIcon"></i>
    <i class="bi bi-qr-code display-1 text-primary d-none qr-scanning" id="qrIcon"></i>
  `;
}

// called when QR read
let lastScanned = null;
function qrCodeSuccessCallback(decodedText, decodedResult) {
  // prevent repeated immediate reads
  if (lastScanned && lastScanned === decodedText) return;
  lastScanned = decodedText;
  // play feedback
  showToast("QR Scanned", `Code: ${decodedText}`, "info");

  // Call backend to mark attendance
  markAttendance(decodedText)
    .then((result) => {
      if (result && result.ok) {
        // Check if attendance was already marked
        if (result.message === "Already marked") {
          showToast(
            "Already Scanned",
            `${result.user_name || result.user_id} has already marked attendance for this event.`,
            "warning"
          );
        } else {
          // New attendance record
          const infoDiv = document.getElementById("lastScanInfo");
          if (infoDiv) {
            infoDiv.classList.remove("d-none");
            const nameEl = document.getElementById("lastScanName");
            const idEl = document.getElementById("lastScanId");
            const eventEl = document.getElementById("lastScanEvent");
            
            if (nameEl) nameEl.textContent = result.user_name || "Student";
            if (idEl) idEl.textContent = result.user_id || "";
            if (eventEl) eventEl.textContent = result.event_title || "";
          }
          
          showToast(
            "Attendance Marked",
            `Marked attendance for ${result.user_name || result.user_id}`,
            "success"
          );
        }

        // Display scan info
        const infoDiv = document.getElementById("lastScanInfo");
        if (infoDiv) {
          infoDiv.classList.remove("d-none");
          const nameEl = document.getElementById("lastScanName");
          const idEl = document.getElementById("lastScanId");
          const eventEl = document.getElementById("lastScanEvent");
          
          if (nameEl) nameEl.textContent = result.user_name || "Student";
          if (idEl) idEl.textContent = result.user_id || "";
          if (eventEl) eventEl.textContent = result.event_title || "";
        }
      } else {
        // Handle different error types
        handleAttendanceError(result);
      }
      // short delay before allowing another same code
      setTimeout(() => {
        lastScanned = null;
      }, 1500);
    })
    .catch((err) => {
      console.error("Attendance marking error:", err);
      showToast(
        "Error",
        "An unexpected error occurred while marking attendance.",
        "danger"
      );
      setTimeout(() => {
        lastScanned = null;
      }, 1500);
    });
}

function qrCodeErrorCallback(errorMessage) {
  // ignore frequent noise; optionally show small console msg
  // console.debug("QR error", errorMessage);
}

function handleAttendanceError(result) {
  // Map backend errors to user-friendly messages
  const errorMessage = result?.error || "Unknown error";
  const errorMap = {
    "Missing qr_code": "Invalid QR code. Please try again.",
    "Event not found": "Event not found. Make sure you're scanning a valid QR code.",
    "DB error fetching event": "Database error. Please try again.",
    "DB error checking signup": "Database error. Please try again.",
    "DB error checking attendance": "Database error. Please try again.",
    "Event has not started yet": "This event has not started yet. Attendance cannot be marked.",
    "Event attendance window closed": "The attendance window for this event has closed.",
    "User is not signed up for this event": "You must be signed up for this event to mark attendance.",
    "Failed to mark attendance": "Failed to mark attendance. Please try again.",
    "Scanner must provide a valid token or scanned_user_id": "Authentication error. Please log in again.",
    "Server error": "Server error occurred. Please try again later.",
    "Network error. Please check your connection.": "Network error. Please check your connection.",
  };

  // Use mapped message or fallback to returned error
  const displayMessage = errorMap[errorMessage] || errorMessage;

  // Determine severity level based on error type
  let severity = "danger";
  if (
    errorMessage.includes("not started") || 
    errorMessage.includes("window closed") ||
    errorMessage.includes("not signed up")
  ) {
    severity = "warning";
  }

  showToast("Mark Attendance Failed", displayMessage, severity);
}

async function markAttendance(qr_code) {
  const body = { qr_code };
  
  try {
    const resp = await fetch("/api/attendance/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Unknown error" }));
      return { ok: false, ...errorData };
    }
    
    const data = await resp.json();
    
    // Fetch user and event details for display
    if (data.attendance) {
      try {
        const { data: userData } = await supabase
          .from("User")
          .select("user_id, name, email")
          .eq("user_id", data.attendance.user_id)
          .single();
        
        const { data: eventData } = await supabase
          .from("event")
          .select("event_id, title")
          .eq("event_id", data.attendance.event_id)
          .single();
        
        // Attach user and event info to result
        if (userData) {
          data.user_name = userData.name || userData.email || userData.user_id;
          data.user_id = userData.user_id;
        }
        if (eventData) {
          data.event_title = eventData.title;
        }
      } catch (err) {
        console.error("Error fetching user/event details:", err);
        // Continue even if fetching details fails
      }
    }
    
    // ✅ Create notification for user (only if new attendance, not already marked)
    if (currentUser && data.message !== "Already marked" && typeof notifyUserAttendanceMarked === "function") {
      try {
        await notifyUserAttendanceMarked(
          currentUser.id,
          data.event_title || "Event",
          "present"
        );
      } catch (notifErr) {
        console.error("Notification error (non-blocking):", notifErr);
      }
    }
    
    // Refresh past scans after successful scan
    await loadPastScans();
    
    return data;
  } catch (err) {
    console.error("markAttendance fetch error:", err);
    return { 
      ok: false, 
      error: "Network error. Please check your connection." 
    };
  }
}

// ===== PAST SCANS SECTION =====
async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return;
    const json = await res.json();
    currentUser = json.user || null;
  } catch (err) {
    console.error("Error fetching current user:", err);
  }
}

async function loadPastScans() {
  if (!currentUser) return;

  try {
    // Fetch attendance records where user_id is current user
    // Include event title and user name via joins
    const { data: scans, error } = await supabase
      .from("event_signup")
      .select("*, event(title), User(name)")
      .eq("user_id", currentUser.id)
      .order("attendance_scanned_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error loading past scans:", error);
      return;
    }

    const container = document.getElementById("pastScansContainer");
    if (!scans || scans.length === 0) {
      container.innerHTML = '<p class="text-muted">No scans yet.</p>';
      return;
    }

    console.log(scans);

    // Build list of past scans
    const scansList = scans
      .map((scan) => {
        const scanTime = scan.attendance_scanned_at
          ? new Date(scan.attendance_scanned_at).toLocaleString("en-SG")
          : "—";
        const eventTitle = scan.event?.title || "Unknown Event";
        const userName = scan.User?.name || "Unknown User";
        const statusBadge =
          scan.attendance_status === "present"
            ? '<span class="badge bg-success">Present</span>'
            : scan.attendance_status === "absent"
              ? '<span class="badge bg-danger">Absent</span>'
              : '<span class="badge bg-secondary">Unknown</span>';

        return `
          <div class="list-group-item list-group-item-action">
            <div class="d-flex w-100 justify-content-between align-items-start">
              <div>
                <h6 class="mb-1">${eventTitle}</h6>
                <p class="mb-1 small text-muted">${userName}</p>
                <small class="text-muted">${scanTime}</small>
              </div>
              ${statusBadge}
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<div class="list-group">${scansList}</div>`;
  } catch (err) {
    console.error("loadPastScans error:", err);
  }
}

/* small toast helper */
function showToast(title, message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toastId = `toast-${Date.now()}`;
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          <strong>${title}:</strong> ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", toastHtml);
  const toastEl = new bootstrap.Toast(document.getElementById(toastId), {
    delay: 4000,
  });
  toastEl.show();
  // remove after hidden
  document.getElementById(toastId).addEventListener("hidden.bs.toast", () => {
    document.getElementById(toastId).remove();
  });
}
