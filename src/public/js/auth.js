// auth.js — FINAL FIX (no Supabase Auth) WITH EXCO SECRET CODE + FILTER UX

// Utility: POST JSON
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return res.json().then((data) => ({ status: res.status, data }));
}

// Button loading animation
function setFormLoading(formId, isLoading) {
  const form = document.getElementById(formId);
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
  } else {
    button.disabled = false;
    button.innerHTML = button.getAttribute("data-original-text") || "Submit";
  }
}

// Success / error button animation
function showFormIcon(formId, type) {
  const form = document.getElementById(formId);
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;

  let icon = "";
  if (type === "success") {
    icon = '<i class="bi bi-check-circle-fill text-success me-2"></i>Success!';
  } else if (type === "error") {
    icon = '<i class="bi bi-x-circle-fill text-danger me-2"></i>Error!';
  }

  const original = button.innerHTML;
  button.innerHTML = icon;
  button.disabled = true;

  setTimeout(() => {
    button.innerHTML = original;
    button.disabled = false;
  }, 1500);
}

// =======================================================
// MAIN EVENT LISTENER
// =======================================================
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const registerTeacherForm = document.getElementById("registerTeacherForm"); // <--- NEW: Teacher Form

  // ------------------- LOGIN -------------------
  if (loginForm) {
    const loginBtn = loginForm.querySelector('button[type="submit"]');
    if (loginBtn) loginBtn.setAttribute("data-original-text", loginBtn.innerHTML);

    let errorBox = document.getElementById("login-error-box");
    if (!errorBox) {
      errorBox = document.createElement("div");
      errorBox.id = "login-error-box";
      errorBox.className = "alert alert-danger mt-3";
      errorBox.style.display = "none";
      loginForm.prepend(errorBox);
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const identifier = document.getElementById("identifier").value.trim();
      const password = document.getElementById("password").value;
      errorBox.style.display = "none";

      let body = { password };

      // UPDATED LOGIC: Check for @ to distinguish Email vs ID (Supports Staff IDs like S1234567)
      if (identifier.includes("@")) {
        body.email = identifier;
      } else {
        // Assume it is an Admin Number (Student) or Staff ID (Teacher)
        body.admin_number = identifier.toUpperCase();
      }

      setFormLoading("loginForm", true);
      const { status, data } = await postJson("/api/auth/login", body);

      if (status === 200) {
        localStorage.setItem("eventlyUser", JSON.stringify(data.user));
        showFormIcon("loginForm", "success");
        if (typeof showToast === "function") showToast("Welcome", "Login successful", "success");
        setTimeout(() => (window.location.href = "dashboard.html"), 900);
      } else {
        errorBox.style.display = "block";
        errorBox.textContent = data.error || "Invalid login credentials. Please try again.";
        showFormIcon("loginForm", "error");
        setFormLoading("loginForm", false);
      }
    });
  }

  // ------------------- REGISTER (STUDENT / EXCO) -------------------
  if (registerForm) {
    const registerBtn = registerForm.querySelector('button[type="submit"]');
    if (registerBtn) registerBtn.setAttribute("data-original-text", registerBtn.innerHTML);

    const ccaRow = document.getElementById("ccaRow");
    const ccaSelect = document.getElementById("cca_id");
    const userTypeSelect = document.getElementById("user_type");
    const secretRow = document.getElementById("secretCodeRow");
    const ccaFilter = document.getElementById("ccaFilter");

    let allCcas = [];

    function renderCcaOptions(list, role) {
      // Placeholder varies by role (students optional, exco required)
      const placeholder = role === "exco" ? "-- Select CCA --" : "-- Select CCA --";
      ccaSelect.innerHTML = `<option value="">${placeholder}</option>`;
      list.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.cca_id;
        opt.textContent = c.name;
        ccaSelect.appendChild(opt);
      });
    }

    async function loadCcas() {
      const res = await fetch("/api/auth/cca");
      const payload = await res.json();
      allCcas = payload.ccas || payload || [];
      renderCcaOptions(allCcas, userTypeSelect.value);
    }

    function updateVisibilityForRole() {
      const type = userTypeSelect.value;

      // CCA row is visible for both Student and Exco
      ccaRow.style.display = "";
      // Students: optional
      ccaSelect.required = type === "exco"; // required only for exco
      // Secret code for exco only
      secretRow.style.display = type === "exco" ? "" : "none";
    }

    // Filter logic: runs on input
    function handleFilter() {
      const q = ccaFilter.value.trim().toLowerCase();
      const filtered = !q
        ? allCcas
        : allCcas.filter((c) => c.name.toLowerCase().includes(q));
      renderCcaOptions(filtered, userTypeSelect.value);
    }

    // Init
    loadCcas();
    updateVisibilityForRole();

    // Events
    userTypeSelect.addEventListener("change", () => {
      updateVisibilityForRole();
      // keep whatever is typed in filter, but re-render with new placeholder/requirement
      handleFilter();
    });
    ccaFilter.addEventListener("input", handleFilter);

    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        admin_number: document.getElementById("admin_number").value.trim().toUpperCase(),
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        user_type: document.getElementById("user_type").value,
      };

      // Student: CCA optional; Exco: CCA + secret required
      if (payload.user_type === "exco") {
        payload.cca_id = ccaSelect.value || null;
        payload.exco_secret = document.getElementById("exco_secret")?.value || "";
      } else {
        payload.cca_id = ccaSelect.value || null; // optional
      }

      setFormLoading("registerForm", true);
      const { status, data } = await postJson("/api/auth/register", payload);

      if (status === 201) {
        showFormIcon("registerForm", "success");
        if (typeof showToast === "function") showToast("Registered", "Your account is created!", "success");
        setTimeout(() => (window.location.href = "login.html"), 1000);
      } else {
        // Make sure the button never stays stuck
        setFormLoading("registerForm", false);
        showFormIcon("registerForm", "error");

        // Specific popup for invalid exco code if server sent that error
        const msg =
          data?.error && /secret code/i.test(data.error)
            ? "Invalid Exco Secret Code"
            : data?.error || "Registration failed";

        // If you have a toast helper, this will be a popup; else fallback alert
        if (typeof showToast === "function") {
          showToast("Register failed", msg, "error");
        } else {
          alert(msg);
        }
      }
    });
  }

  // ------------------- REGISTER TEACHER (NEW) -------------------
  if (registerTeacherForm) {
    const ccaSelect = document.getElementById("cca_id");

    // Load CCAs for Teacher (reuse endpoint)
    async function loadCcasForTeacher() {
      try {
        const res = await fetch("/api/auth/cca");
        const payload = await res.json();
        const list = payload.ccas || payload || [];
        
        ccaSelect.innerHTML = `<option value="">-- Select CCA --</option>`;
        list.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.cca_id;
          opt.textContent = c.name;
          ccaSelect.appendChild(opt);
        });
      } catch (err) {
        console.error("Failed to load CCAs", err);
      }
    }
    loadCcasForTeacher();

    registerTeacherForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        admin_number: document.getElementById("admin_number").value.trim(), // Staff ID
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        user_type: "teacher", // Hardcoded for this form
        cca_id: ccaSelect.value,
        teacher_secret: document.getElementById("teacher_secret").value.trim()
      };

      setFormLoading("registerTeacherForm", true);
      
      const { status, data } = await postJson("/api/auth/register", payload);

      if (status === 201) {
        showFormIcon("registerTeacherForm", "success");
        if (typeof showToast === "function") showToast("Success", "Teacher account created!", "success");
        setTimeout(() => (window.location.href = "login.html"), 1000);
      } else {
        setFormLoading("registerTeacherForm", false);
        showFormIcon("registerTeacherForm", "error");
        
        const msg = data?.error || "Registration failed";
        if (typeof showToast === "function") showToast("Error", msg, "error");
        else alert(msg);
      }
    });
  }
});

// =======================================================
// LOGOUT
// =======================================================
async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  localStorage.removeItem("eventlyUser");
  if (typeof showToast === "function") showToast("Logged out", "You have been signed out.", "info");
  window.location.href = "login.html"; // Updated to redirect to login
}

// Password visibility toggles
document.addEventListener("click", (e) => {
  if (e.target.closest("#toggleLoginPw")) {
    const input = document.getElementById("password");
    const icon = e.target.closest("#toggleLoginPw").querySelector("i");
    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("bi-eye");
    icon.classList.toggle("bi-eye-slash");
  }

  if (e.target.closest("#toggleRegisterPw")) {
    const input = document.getElementById("password");
    const icon = e.target.closest("#toggleRegisterPw").querySelector("i");
    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("bi-eye");
    icon.classList.toggle("bi-eye-slash");
  }
});
