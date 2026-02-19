
// ============================================
// Toast Function
// ============================================
function showToast(title, message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;

  const toastId = "toast-" + Date.now();
  const bgClass =
    type === "success" ? "bg-success" :
    type === "error"   ? "bg-danger"  :
                         "bg-info";

  const toastHTML = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive">
      <div class="toast-header ${bgClass} text-white">
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">${message}</div>
    </div>
  `;
  toastContainer.insertAdjacentHTML("beforeend", toastHTML);

  const toast = new bootstrap.Toast(document.getElementById(toastId));
  toast.show();
}

// ============================================
// DATE HELPERS (unchanged)
// ============================================
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isUpcoming(dateStr) {
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60);
  return diff > 0 && diff <= 48;
}
