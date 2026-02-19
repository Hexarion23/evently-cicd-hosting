const initFooter = () => {
  const footerHTML = `
    <footer class="bg-white border-top mt-5">
      <div class="container py-5">
        <div class="row g-4">
          <div class="col-lg-4">
            <div class="d-flex align-items-center gap-2 mb-3">
              <img src="../assets/sp_logo.jpg" alt="SP Logo" style="height: 30px; width: auto;">
              <span class="fw-bold fs-5">Evently</span>
            </div>
            <p class="text-muted small">
              The unofficial event management platform for Singapore Polytechnic CCAs. 
              Streamlining participation and leadership since 2025.
            </p>
          </div>

          <div class="col-6 col-lg-2">
            <h6 class="fw-bold mb-3">Platform</h6>
            <ul class="list-unstyled small">
              <li class="mb-2"><a href="dashboard.html" class="text-decoration-none text-muted">Dashboard</a></li>
              <li class="mb-2"><a href="calendar.html" class="text-decoration-none text-muted">Event Calendar</a></li>
              <li class="mb-2"><a href="profile.html" class="text-decoration-none text-muted">My Profile</a></li>
            </ul>
          </div>

          <div class="col-6 col-lg-2">
            <h6 class="fw-bold mb-3">Support</h6>
            <ul class="list-unstyled small">
              <li class="mb-2"><a href="guide.html" class="text-decoration-none text-muted">User Guide</a></li>
              <li class="mb-2"><a href="mailto:eventlysp@gmail.com?subject=Evently%20Bug%20Report" class="text-decoration-none text-muted">Report Bug</a></li>
              <li class="mb-2"><a href="https://www.sp.edu.sg/life-at-sp/student-life" target="_blank" class="text-decoration-none text-muted">Contact Student Life</a></li>
            </ul>
          </div>

          <div class="col-lg-4">
            <div class="p-4 rounded-3 text-white" style="background: linear-gradient(135deg, #C8102E 0%, #A00D24 100%);">
              <h6 class="fw-bold mb-2">Singapore Polytechnic</h6>
              <p class="small mb-0 opacity-75">500 Dover Road, Singapore 139651</p>
              <hr class="my-3 opacity-25">
              <div class="d-flex gap-3">
                <a href="https://www.facebook.com/singaporepolytechnic/" target="_blank" class="text-white fs-5"><i class="bi bi-facebook"></i></a>
                <a href="https://www.instagram.com/singaporepoly/" target="_blank" class="text-white fs-5"><i class="bi bi-instagram"></i></a>
                <a href="https://www.linkedin.com/school/singapore-polytechnic/" target="_blank" class="text-white fs-5"><i class="bi bi-linkedin"></i></a>
              </div>
            </div>
          </div>
        </div>

        <hr class="my-5 opacity-10">

        <div class="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <p class="text-muted small mb-0">&copy; 2026 Singapore Polytechnic. All rights reserved.</p>
          <div class="d-flex gap-4">
            <a href="legal.html#privacy" class="text-decoration-none text-muted small">Privacy Policy</a>
            <a href="legal.html#terms" class="text-decoration-none text-muted small">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>`;

  document.body.insertAdjacentHTML("beforeend", footerHTML);
};

initFooter();
