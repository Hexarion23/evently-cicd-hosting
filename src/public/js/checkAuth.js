// =========================================================
// checkAuth.js — ROLE MANAGEMENT & NAVBAR UPDATES
// =========================================================

async function checkAuth() {
  const createEventBtn = document.getElementById("createEventBtn");

  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      createEventBtn?.classList.add("d-none");
      // If we are on a protected page, redirect to login
      const publicPaths = [
        "index.html",
        "login.html",
        "register.html",
        "register-teacher.html",
        "legal.html",
        "guide.html",
      ];
      const currentFile = window.location.pathname.split("/").pop();
      if (!publicPaths.includes(currentFile)) {
        window.location.href = "login.html";
      }
      return;
    }

    const json = await res.json();
    const user = json.user;

    // --- NEW: Redirect Teachers if they end up on a student page ---

    // Define student-only pages
    const studentOnlyPages = [
      "dashboard.html",
      "calendar.html",
      "profile.html",
      "event-details.html",
      "past-events.html",
      "qr-scanner.html",
    ];
    const currentFile = window.location.pathname.split("/").pop();

    // ONLY redirect if the teacher is currently ON a student page
    if (user.role === "teacher" && studentOnlyPages.includes(currentFile)) {
      console.log(
        "Teacher detected on student page. Redirecting to Approvals...",
      );
      window.location.href = "teacher-dashboard.html";
      return;
    }
    // 1. Handle EXCO Buttons
    if (user.role === "exco") {
      createEventBtn?.classList.remove("d-none");
    } else {
      createEventBtn?.classList.add("d-none");
    }

    // 2. Handle TEACHER Navbar Link
    // If user is a teacher, add the link to teacher-dashboard.html
    if (user.role === "teacher") {
      injectTeacherNavLink();
    }
  } catch (err) {
    createEventBtn?.classList.add("d-none");
  }
}

// Helper to add the "Approvals" link to the navbar
function injectTeacherNavLink() {
  const navList = document.querySelector(".navbar-nav");

  // Check if link already exists to prevent duplicates
  if (document.getElementById("teacher-nav-link")) return;

  if (navList) {
    const li = document.createElement("li");
    li.className = "nav-item";

    const a = document.createElement("a");
    a.className = "nav-link fw-bold text-danger"; // Red text to stand out
    a.href = "teacher-dashboard.html";
    a.id = "teacher-nav-link";
    a.innerHTML = '<i class="bi bi-shield-lock me-1"></i>Approvals';

    // Insert as the first item in the menu
    li.appendChild(a);
    navList.prepend(li);
  }
}

checkAuth();
