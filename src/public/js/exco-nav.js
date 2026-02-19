// ============================
// EXCO NAVBAR AUTO-INJECTOR
// ============================
//
// This script automatically adds a "Waitlist Admin" link
// to the "Tools" dropdown ONLY if the logged-in user is EXCO.
//

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Fetch current user
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) return; // user not logged in

    const json = await res.json();
    const user = json.user;

    if (!user || user.role !== "exco") return; // only exco may see

    // 2. Find the "Tools" dropdown menu container
    const toolsDropdown = document.getElementById("toolsDropdownMenu");

    if (!toolsDropdown) return;

    // 3. Create divider and link
    const divider = document.createElement("li");
    divider.innerHTML = '<hr class="dropdown-divider">';

    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "dropdown-item text-danger fw-semibold";
    link.href = "waitlist-admin.html";
    link.innerHTML = '<i class="bi bi-shield-lock me-2"></i>Waitlist Admin';
    li.appendChild(link);

    // 4. Insert into dropdown
    toolsDropdown.appendChild(divider);
    toolsDropdown.appendChild(li);

  } catch (err) {
    console.error("Error injecting EXCO nav link:", err);
  }
});