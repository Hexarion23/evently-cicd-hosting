// ============================================
// PROPOSAL BUILDER - JavaScript
// ============================================

const TEMPLATES = {
  standard: {
    name: "Standard Proposal",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "purpose",
        label: "Purpose & Objectives",
        type: "textarea",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of EXCOs",
        type: "number",
        required: true,
      },
      {
        id: "timeline",
        label: "Event Timeline",
        type: "textarea",
        required: true,
      },
      { id: "budget", label: "Budget (if any)", type: "text", required: false },
      {
        id: "expectedAttendees",
        label: "Expected Attendees",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "resources",
        label: "Resources Needed",
        type: "textarea",
        required: false,
      },
      {
        id: "risks",
        label: "Potential Risks & Mitigation",
        type: "textarea",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  academic: {
    name: "Academic Event",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "purpose",
        label: "Educational Objectives",
        type: "textarea",
        required: true,
      },
      {
        id: "targetAudience",
        label: "Target Audience",
        type: "text",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator / Speaker",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of Organizers",
        type: "number",
        required: true,
      },
      {
        id: "keyTopics",
        label: "Key Topics / Agenda",
        type: "textarea",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "expectedAttendees",
        label: "Expected Participants",
        type: "number",
        required: true,
      },
      {
        id: "duration",
        label: "Event Duration (hours)",
        type: "number",
        required: true,
      },
      {
        id: "resources",
        label: "Learning Materials & Resources",
        type: "textarea",
        required: false,
      },
      {
        id: "assessment",
        label: "Assessment / Feedback Method",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  social: {
    name: "Social Event",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "purpose",
        label: "Event Description & Vibe",
        type: "textarea",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of Volunteers",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "expectedAttendees",
        label: "Expected Attendees",
        type: "number",
        required: true,
      },
      {
        id: "activities",
        label: "Planned Activities",
        type: "textarea",
        required: true,
      },
      {
        id: "budget",
        label: "Budget Breakdown",
        type: "textarea",
        required: false,
      },
      {
        id: "decorations",
        label: "Decorations & Ambiance",
        type: "text",
        required: false,
      },
      {
        id: "catering",
        label: "Catering & Refreshments",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  fundraising: {
    name: "Fundraising Event",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "cause",
        label: "Cause / Charity Partner",
        type: "text",
        required: true,
      },
      {
        id: "purpose",
        label: "Fundraising Goal & Purpose",
        type: "textarea",
        required: true,
      },
      {
        id: "targetAmount",
        label: "Target Amount (SGD)",
        type: "number",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of Organizers",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "expectedAttendees",
        label: "Expected Donors",
        type: "number",
        required: true,
      },
      {
        id: "timeline",
        label: "Event Timeline",
        type: "textarea",
        required: true,
      },
      {
        id: "fundAllocation",
        label: "Fund Allocation Plan",
        type: "textarea",
        required: true,
      },
      {
        id: "activities",
        label: "Fundraising Activities",
        type: "textarea",
        required: true,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  competition: {
    name: "Competition",
    fields: [
      {
        id: "eventName",
        label: "Competition Name",
        type: "text",
        required: true,
      },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "purpose",
        label: "Competition Overview & Rules",
        type: "textarea",
        required: true,
      },
      {
        id: "categories",
        label: "Competition Categories / Teams",
        type: "text",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator / Referee",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of Organizers",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "expectedParticipants",
        label: "Expected Participants / Teams",
        type: "number",
        required: true,
      },
      {
        id: "timeline",
        label: "Competition Timeline & Schedule",
        type: "textarea",
        required: true,
      },
      {
        id: "prizes",
        label: "Prizes & Awards",
        type: "textarea",
        required: true,
      },
      {
        id: "criteria",
        label: "Judging Criteria",
        type: "textarea",
        required: false,
      },
      {
        id: "budget",
        label: "Budget for Prizes & Equipment",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  showcase: {
    name: "Showcase or Performance",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Performance Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      {
        id: "endDate",
        label: "End Date (if multi-day)",
        type: "date",
        required: false,
      },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      { id: "theme", label: "Theme / Concept", type: "text", required: true },
      {
        id: "description",
        label: "Performance Description & Vision",
        type: "textarea",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator / Director",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of EXCOs",
        type: "number",
        required: true,
      },
      {
        id: "numPerformers",
        label: "Number of Performers",
        type: "number",
        required: true,
      },
      {
        id: "venue",
        label: "Venue / Auditorium",
        type: "text",
        required: true,
      },
      {
        id: "capacity",
        label: "Expected Audience Capacity",
        type: "number",
        required: true,
      },
      {
        id: "duration",
        label: "Performance Duration (minutes)",
        type: "number",
        required: true,
      },
      {
        id: "performanceSchedule",
        label: "Performance Timeline & Act Schedule",
        type: "textarea",
        required: true,
      },
      {
        id: "technicalRequirements",
        label: "Technical Requirements (Sound, Lighting, Projection)",
        type: "textarea",
        required: true,
      },
      {
        id: "propsAndCostumes",
        label: "Props & Costumes (List with costs)",
        type: "textarea",
        required: false,
      },
      {
        id: "rehearsalSchedule",
        label: "Rehearsal Schedule & Dates",
        type: "textarea",
        required: true,
      },
      {
        id: "budget",
        label: "Total Budget Breakdown",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  outreach: {
    name: "Community Outreach / Service Learning",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "cause",
        label: "Cause / Social Issue",
        type: "text",
        required: true,
      },
      {
        id: "purpose",
        label: "Event Purpose & Learning Objectives",
        type: "textarea",
        required: true,
      },
      {
        id: "beneficiaryProfile",
        label: "Beneficiary Profile (Who are we helping?)",
        type: "textarea",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numVolunteers",
        label: "Number of Volunteers Needed",
        type: "number",
        required: true,
      },
      {
        id: "numBeneficiaries",
        label: "Expected Number of Beneficiaries",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "volunteerRoles",
        label: "Volunteer Roles & Responsibilities",
        type: "textarea",
        required: true,
      },
      {
        id: "trainingPlan",
        label: "Training / Briefing Plan for Volunteers",
        type: "textarea",
        required: true,
      },
      {
        id: "riskAssessment",
        label: "Risk Assessment (especially for vulnerable groups)",
        type: "textarea",
        required: true,
      },
      {
        id: "impactMetrics",
        label: "Long-term Impact Metrics & Follow-up",
        type: "textarea",
        required: true,
      },
      {
        id: "partnerInfo",
        label: "Partner Organization / NGO Information",
        type: "text",
        required: false,
      },
      {
        id: "budget",
        label: "Budget & Resource Requirements",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  networking: {
    name: "Industry Networking / Career Fair",
    fields: [
      { id: "eventName", label: "Event Name", type: "text", required: true },
      {
        id: "startDate",
        label: "Event Start Date",
        type: "date",
        required: true,
      },
      { id: "startTime", label: "Start Time", type: "time", required: true },
      { id: "endDate", label: "Event End Date", type: "date", required: false },
      { id: "endTime", label: "End Time", type: "time", required: false },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "purpose",
        label: "Event Purpose & Outcome Goals",
        type: "textarea",
        required: true,
      },
      {
        id: "targetAudience",
        label: "Target Audience (Students, Year Levels)",
        type: "text",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numExcos",
        label: "Number of EXCOs",
        type: "number",
        required: true,
      },
      { id: "venue", label: "Venue / Location", type: "text", required: true },
      {
        id: "expectedStudents",
        label: "Expected Student Participants",
        type: "number",
        required: true,
      },
      {
        id: "numCompanies",
        label: "Number of Companies / Guest Speakers",
        type: "number",
        required: true,
      },
      {
        id: "guestSpeakers",
        label: "Guest Speaker Bios & Topics",
        type: "textarea",
        required: true,
      },
      {
        id: "sponsorshipPackages",
        label: "Corporate Sponsorship Packages (Details & Benefits)",
        type: "textarea",
        required: true,
      },
      {
        id: "cvProcess",
        label: "CV Submission & Collection Process",
        type: "textarea",
        required: true,
      },
      {
        id: "careerPaths",
        label: "Industries / Career Paths Represented",
        type: "text",
        required: false,
      },
      {
        id: "eventSchedule",
        label: "Event Timeline & Program Schedule",
        type: "textarea",
        required: true,
      },
      {
        id: "budget",
        label: "Total Budget (Sponsorship, Logistics)",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
  training: {
    name: "Training",
    fields: [
      {
        id: "eventName",
        label: "Training Program Name",
        type: "text",
        required: true,
      },
      {
        id: "discipline",
        label: "Training Type / Discipline",
        type: "text",
        required: true,
      },
      { id: "cca", label: "CCA / Organization", type: "text", required: true },
      {
        id: "startDate",
        label: "Training Start Date",
        type: "date",
        required: true,
      },
      {
        id: "endDate",
        label: "Training End Date (if applicable)",
        type: "date",
        required: false,
      },
      {
        id: "frequency",
        label: "Training Frequency (e.g., Weekly, Bi-weekly)",
        type: "text",
        required: true,
      },
      {
        id: "chiefCoordinator",
        label: "Chief Trainer / Coordinator",
        type: "text",
        required: true,
      },
      {
        id: "numParticipants",
        label: "Expected Number of Participants",
        type: "number",
        required: true,
      },
      {
        id: "venue",
        label: "Training Venue / Location",
        type: "text",
        required: true,
      },
      {
        id: "durationPerSession",
        label: "Duration per Session (minutes)",
        type: "number",
        required: true,
      },
      {
        id: "trainingObjectives",
        label: "Training Objectives & Learning Outcomes",
        type: "textarea",
        required: true,
      },
      {
        id: "curriculum",
        label: "Curriculum / Topics Covered",
        type: "textarea",
        required: true,
      },
      {
        id: "assessment",
        label: "Assessment / Progress Tracking Methods",
        type: "textarea",
        required: false,
      },
      {
        id: "equipmentResources",
        label: "Equipment & Resources Needed",
        type: "textarea",
        required: true,
      },
      {
        id: "levels",
        label: "Participant Levels (Beginner, Intermediate, Advanced)",
        type: "text",
        required: false,
      },
      {
        id: "budget",
        label: "Budget for Equipment & Facilities",
        type: "text",
        required: false,
      },
      {
        id: "contact",
        label: "Contact Information",
        type: "text",
        required: true,
      },
    ],
  },
};

// Current state
let currentTemplate = "standard";
let formData = {};

// Helper function to format time
function formatTime(timeStr) {
  if (!timeStr) return "";

  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minutes} ${ampm}`;
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadTemplate("standard");
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Template selection
  document.querySelectorAll(".template-option").forEach((option) => {
    option.addEventListener("click", () => {
      const template = option.dataset.template;
      loadTemplate(template);
    });
  });

  // Download button
  document
    .getElementById("downloadBtn")
    .addEventListener("click", downloadProposal);

  // Reset button
  document.getElementById("resetBtn").addEventListener("click", resetForm);

  // Form input listeners for live preview
  document.addEventListener("input", updatePreview);
  document.addEventListener("change", updatePreview);
}

// Load template
function loadTemplate(templateKey) {
  const template = TEMPLATES[templateKey];
  currentTemplate = templateKey;

  // Update active state
  document.querySelectorAll(".template-option").forEach((option) => {
    option.classList.remove("active");
  });
  document
    .querySelector(`[data-template="${templateKey}"]`)
    .classList.add("active");

  // Update template display
  document.getElementById("templateName").textContent = template.name;

  // Clear form
  formData = {};

  // Render form fields
  renderFormFields(template.fields);

  // Update preview
  updatePreview();
}

// Render form fields
function renderFormFields(fields) {
  const form = document.getElementById("proposalForm");
  form.innerHTML = "";

  fields.forEach((field, index) => {
    const fieldGroup = createFormField(field);
    form.appendChild(fieldGroup);
  });
}

// Create individual form field
function createFormField(field) {
  const div = document.createElement("div");

  // Determine if we need grouping
  let isGrouped = false;
  const groupDiv = document.createElement("div");

  if (field.type === "textarea") {
    div.className = "form-group";
    const label = document.createElement("label");
    label.className = "form-label";
    label.innerHTML = `
      <span>${field.label}</span>
      ${field.required ? '<span class="required">*</span>' : ""}
    `;

    const textarea = document.createElement("textarea");
    textarea.className = "form-control";
    textarea.id = field.id;
    textarea.placeholder = `Enter ${field.label.toLowerCase()}`;
    textarea.required = field.required;

    div.appendChild(label);
    div.appendChild(textarea);
  } else if (field.type === "number") {
    div.className = "form-group";
    const label = document.createElement("label");
    label.className = "form-label";
    label.innerHTML = `
      <span>${field.label}</span>
      ${field.required ? '<span class="required">*</span>' : ""}
    `;

    const input = document.createElement("input");
    input.type = "number";
    input.className = "form-control";
    input.id = field.id;
    input.placeholder = `Enter ${field.label.toLowerCase()}`;
    input.required = field.required;

    div.appendChild(label);
    div.appendChild(input);
  } else if (
    field.type === "date" ||
    field.type === "datetime-local" ||
    field.type === "time"
  ) {
    div.className = "form-group";
    const label = document.createElement("label");
    label.className = "form-label";
    label.innerHTML = `
      <span>${field.label}</span>
      ${field.required ? '<span class="required">*</span>' : ""}
    `;

    const input = document.createElement("input");
    input.type = field.type;
    input.className = "form-control";
    input.id = field.id;
    input.required = field.required;

    div.appendChild(label);
    div.appendChild(input);
  } else {
    // Text input
    div.className = "form-group";
    const label = document.createElement("label");
    label.className = "form-label";
    label.innerHTML = `
      <span>${field.label}</span>
      ${field.required ? '<span class="required">*</span>' : ""}
    `;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control";
    input.id = field.id;
    input.placeholder = `Enter ${field.label.toLowerCase()}`;
    input.required = field.required;

    div.appendChild(label);
    div.appendChild(input);
  }

  return div;
}

// Update form data and preview
function updatePreview() {
  // Collect form data
  document
    .querySelectorAll("#proposalForm input, #proposalForm textarea")
    .forEach((field) => {
      formData[field.id] = field.value;
    });

  // Generate preview
  const template = TEMPLATES[currentTemplate];
  const previewHTML = generatePreviewHTML(template);

  document.getElementById("previewContent").innerHTML = previewHTML;
}

// Generate preview HTML
function generatePreviewHTML(template) {
  const eventName = formData["eventName"] || "Event Name";

  let html = `
    <div class="proposal-preview">
      <div class="proposal-header">
        <h1>Event Proposal</h1>
        <p><strong>${eventName}</strong></p>
      </div>

      <div class="proposal-details">
        <div class="detail-item">
          <label>Event Name</label>
          <span>${formData["eventName"] || "—"}</span>
        </div>
  `;

  // Add date detail
  if (formData["startDate"]) {
    let dateTimeText = new Date(formData["startDate"]).toLocaleDateString(
      "en-SG",
    );

    if (formData["startTime"]) {
      dateTimeText += ` at ${formatTime(formData["startTime"])}`;
    }

    html += `
      <div class="detail-item">
        <label>Start Date & Time</label>
        <span>${dateTimeText}</span>
      </div>
    `;
  }

  if (formData["endDate"]) {
    let dateTimeText = new Date(formData["endDate"]).toLocaleDateString(
      "en-SG",
    );

    if (formData["endTime"]) {
      dateTimeText += ` at ${formatTime(formData["endTime"])}`;
    }

    html += `
      <div class="detail-item">
        <label>End Date & Time</label>
        <span>${dateTimeText}</span>
      </div>
    `;
  }

  if (formData["cca"]) {
    html += `
      <div class="detail-item">
        <label>Organization</label>
        <span>${formData["cca"]}</span>
      </div>
    `;
  }

  if (formData["chiefCoordinator"]) {
    html += `
      <div class="detail-item">
        <label>Chief Coordinator</label>
        <span>${formData["chiefCoordinator"]}</span>
      </div>
    `;
  }

  if (formData["numExcos"]) {
    html += `
      <div class="detail-item">
        <label>Team Size</label>
        <span>${formData["numExcos"]} organizers</span>
      </div>
    `;
  }

  if (
    formData["expectedAttendees"] ||
    formData["expectedParticipants"] ||
    formData["expectedDonors"]
  ) {
    const attendeeCount =
      formData["expectedAttendees"] ||
      formData["expectedParticipants"] ||
      formData["expectedDonors"] ||
      "—";
    html += `
      <div class="detail-item">
        <label>Expected Participants</label>
        <span>${attendeeCount}</span>
      </div>
    `;
  }

  if (formData["venue"]) {
    html += `
      <div class="detail-item">
        <label>Venue</label>
        <span>${formData["venue"]}</span>
      </div>
    `;
  }

  html += `</div><div class="section-divider"></div>`;

  // Dynamically add sections based on template
  const template_obj = TEMPLATES[currentTemplate];
  template_obj.fields.forEach((field) => {
    if (
      field.type === "textarea" &&
      formData[field.id] &&
      formData[field.id].trim() !== ""
    ) {
      const sectionTitle = field.label
        .replace(/[&]/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      html += `
        <div class="proposal-section">
          <h2>${sectionTitle}</h2>
          <p>${formData[field.id].replace(/\n/g, "<br>")}</p>
        </div>
      `;
    }
  });

  // Contact info section
  if (formData["contact"]) {
    html += `
      <div class="section-divider"></div>
      <div class="proposal-section">
        <h2>Contact Information</h2>
        <p>${formData["contact"]}</p>
      </div>
    `;
  }

  html += `
    </div>
  `;

  return html;
}

// Collect form data from all input fields
function collectFormData() {
  const data = {};
  document
    .querySelectorAll("#proposalForm input, #proposalForm textarea")
    .forEach((field) => {
      if (field.value.trim() !== "") {
        data[field.id] = field.value;
      }
    });
  return data;
}

// Download proposal as PDF
async function downloadProposal() {
  // Validate form
  const form = document.getElementById("proposalForm");
  if (!form.checkValidity()) {
    alert("Please fill in all required fields before downloading.");
    form.reportValidity();
    return;
  }

  // Show loading modal
  const loadingModal = new bootstrap.Modal(
    document.getElementById("loadingModal"),
  );
  loadingModal.show();

  try {
    // Collect form data
    const formData = collectFormData();

    // Call backend API to generate PDF
    const response = await fetch("/api/proposals/generate/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate PDF");
    }

    // Get the PDF as a blob
    const blob = await response.blob();

    // Create a URL for the blob
    const url = window.URL.createObjectURL(blob);

    // Create a temporary link element and trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = `${formData.eventName || "proposal"}.pdf`;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      loadingModal.hide(); // Hide after the download is initiated
    }, 500);

    alert("PDF generated and downloaded successfully!");
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert(`Error generating PDF: ${error.message}`);
  } finally {
    // Close loading modal
    loadingModal.hide();
  }
}

// Reset form
function resetForm() {
  if (
    confirm("Are you sure you want to reset all fields? This cannot be undone.")
  ) {
    document.getElementById("proposalForm").reset();
    formData = {};
    updatePreview();
  }
}
