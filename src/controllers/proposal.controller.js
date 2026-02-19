import proposalModel from "../models/proposal.model.js";
import { supabase } from "../models/supabaseClient.js";
import jwt from "jsonwebtoken";
import PDFDocument from "pdfkit";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Helper: Get user from token
function getUser(req) {
  const token = req.cookies.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Helper: Format date and time
function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "—";

  const date = new Date(dateStr);
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  let formatted = date.toLocaleDateString("en-SG", options);

  if (timeStr) {
    formatted += ` at ${timeStr}`;
  }

  return formatted;
}

// Helper: Format time only
function formatTime(timeStr) {
  if (!timeStr) return "—";

  // Convert 24h to 12h format
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${minutes} ${ampm}`;
}

// Helper: Draw PDF header with logo and branding
function drawPDFHeader(doc, eventName) {
  // Red accent bar on left
  doc.rect(0, 0, 15, 842).fill("#c8102e");

  // Top border accent
  doc.rect(15, 0, 580, 8).fill("#c8102e");

  // Header background
  doc.rect(15, 8, 580, 100).fill("#f8f9fa");

  // Organization branding (top right)
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#666666")
    .text("EVENTLY", 480, 25, { align: "right", width: 100 });

  doc
    .fontSize(7)
    .fillColor("#999999")
    .text("Event Management System", 480, 38, { align: "right", width: 100 });

  // Main title
  doc
    .fontSize(32)
    .font("Helvetica-Bold")
    .fillColor("#c8102e")
    .text("EVENT PROPOSAL", 40, 30);

  // Event name subtitle
  if (eventName) {
    doc
      .fontSize(18)
      .font("Helvetica")
      .fillColor("#333333")
      .text(eventName.toUpperCase(), 40, 70, { width: 420 });
  }

  // Decorative line
  doc
    .moveTo(40, 105)
    .lineTo(570, 105)
    .strokeColor("#c8102e")
    .lineWidth(2)
    .stroke();
}

// Helper: Draw PDF footer
function drawPDFFooter(doc, pageNum, totalPages) {
  const bottomY = 780;

  // Footer line
  doc
    .moveTo(40, bottomY)
    .lineTo(570, bottomY)
    .strokeColor("#e0e0e0")
    .lineWidth(1)
    .stroke();

  // Store current Y position to restore later
  const savedY = doc.y;

  // Left side - generation info
  const dateText = `Generated on ${new Date().toLocaleDateString("en-SG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;

  doc.fontSize(8).font("Helvetica").fillColor("#999999");
  doc.text(dateText, 40, bottomY + 10, {
    width: 200,
    height: 10,
    ellipsis: true,
  });

  // Right side - page number
  const pageText = `Page ${pageNum} of ${totalPages}`;
  doc.fontSize(8).fillColor("#999999");
  doc.text(pageText, 370, bottomY + 10, {
    width: 200,
    height: 10,
    align: "right",
  });

  // Branding footer
  doc.fontSize(7).fillColor("#c8102e");
  doc.text("Evently Proposal Builder", 40, bottomY + 25, {
    width: 530,
    height: 10,
    align: "center",
  });

  // Restore Y position to prevent cursor advancement
  doc.y = savedY;
}

// Helper: Draw section header
function drawSectionHeader(doc, title, y) {
  // Background bar
  doc.rect(40, y - 2, 530, 22).fill("#f8f9fa");

  // Left accent
  doc.rect(40, y - 2, 4, 22).fill("#c8102e");

  // Title
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#c8102e")
    .text(title.toUpperCase(), 52, y + 3);

  return y + 28;
}

// Helper: Draw key-value detail box
function drawDetailBox(doc, label, value, x, y, width = 250) {
  // Box background
  doc.rect(x, y, width, 40).fillAndStroke("#ffffff", "#e0e0e0").lineWidth(1);

  // Label
  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor("#666666")
    .text(label.toUpperCase(), x + 10, y + 8, { width: width - 20 });

  // Value
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#000000")
    .text(value || "—", x + 10, y + 22, { width: width - 20 });
}

// Helper: Draw content section with professional formatting
function drawContentSection(doc, title, content, startY) {
  let currentY = startY;

  // Check if we need a new page (with more conservative threshold)
  if (currentY > 700) {
    doc.addPage({ margin: 0 });
    doc.rect(0, 0, 15, 842).fill("#c8102e");
    currentY = 50;
  }

  // Section header
  currentY = drawSectionHeader(doc, title, currentY);

  // Content with better formatting
  const contentLines = content.split("\n");
  const maxWidth = 530;

  contentLines.forEach((line) => {
    // Check before each line to avoid overflow
    if (currentY > 740) {
      doc.addPage({ margin: 0 });
      doc.rect(0, 0, 15, 842).fill("#c8102e");
      currentY = 50;
    }

    // Check if line is a bullet point
    if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#333333")
        .text("•", 45, currentY);

      doc.text(line.trim().substring(1).trim(), 60, currentY, {
        width: maxWidth - 20,
        align: "left",
        lineGap: 3,
      });
    } else if (line.trim().length > 0) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#333333")
        .text(line, 40, currentY, {
          width: maxWidth,
          align: "justify",
          lineGap: 3,
        });
    }

    currentY = doc.y + 5;
  });

  return currentY + 15;
}

// ==========================================
// GET ALL USER PROPOSALS
// ==========================================
async function getUserProposals(req, res) {
  try {
    const user = getUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposals = await proposalModel.getUserProposals(user.id);
    return res.json(proposals);
  } catch (err) {
    console.error("Error fetching proposals:", err);
    return res.status(500).json({ error: "Error fetching proposals" });
  }
};

// ==========================================
// GET SINGLE PROPOSAL
// ==========================================
async function getProposal(req, res) {
  try {
    const { id } = req.params;
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposal = await proposalModel.getProposalById(id);

    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Verify ownership
    if (proposal.created_by !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return res.json(proposal);
  } catch (err) {
    console.error("Error fetching proposal:", err);
    return res.status(500).json({ error: "Error fetching proposal" });
  }
};

// ==========================================
// CREATE NEW PROPOSAL
// ==========================================
async function createProposal(req, res) {
  try {
    const user = getUser(req);
    if (!user || user.role !== "exco") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { template_type, event_name, content } = req.body;

    if (!template_type || !event_name || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const proposal = await proposalModel.createProposal({
      created_by: user.id,
      template_type,
      event_name,
      content,
    });

    return res.status(201).json(proposal);
  } catch (err) {
    console.error("Error creating proposal:", err);
    return res.status(500).json({ error: "Error creating proposal" });
  }
};

// ==========================================
// UPDATE PROPOSAL
// ==========================================
async function updateProposal(req, res) {
  try {
    const { id } = req.params;
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposal = await proposalModel.getProposalById(id);

    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Verify ownership
    if (proposal.created_by !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await proposalModel.updateProposal(id, req.body);
    return res.json(updated);
  } catch (err) {
    console.error("Error updating proposal:", err);
    return res.status(500).json({ error: "Error updating proposal" });
  }
};

// ==========================================
// DELETE PROPOSAL
// ==========================================
async function deleteProposal(req, res) {
  try {
    const { id } = req.params;
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposal = await proposalModel.getProposalById(id);

    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Verify ownership
    if (proposal.created_by !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await proposalModel.deleteProposal(id);
    return res.json({ message: "Proposal deleted" });
  } catch (err) {
    console.error("Error deleting proposal:", err);
    return res.status(500).json({ error: "Error deleting proposal" });
  }
};

// ==========================================
// SAVE PROPOSAL DRAFT
// ==========================================
async function saveProposalDraft(req, res) {
  try {
    const { id } = req.params;
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposal = await proposalModel.getProposalById(id);

    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    // Verify ownership
    if (proposal.created_by !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await proposalModel.saveProposalDraft(id, req.body);
    return res.json(updated);
  } catch (err) {
    console.error("Error saving proposal:", err);
    return res.status(500).json({ error: "Error saving proposal" });
  }
};

// ==========================================
// DOWNLOAD PROPOSAL AS PDF (from saved proposal)
// ==========================================
async function downloadProposal(req, res) {
  try {
    const { id } = req.params;
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const proposal = await proposalModel.getProposalById(id);

    if (!proposal) {
      return res.status(404).json({ error: "Proposal not found" });
    }

    if (proposal.created_by !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    let content = proposal.content;
    if (typeof content === "string") {
      content = JSON.parse(content);
    }

    // Use the enhanced PDF generation
    generateEnhancedPDF(res, content, proposal.event_name);
  } catch (err) {
    console.error("Error downloading proposal:", err);
    return res.status(500).json({ error: "Error generating PDF" });
  }
};

// ==========================================
// GENERATE & DOWNLOAD PDF FROM FORM DATA
// ==========================================
async function generatePDFFromFormData(req, res) {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const content = req.body;
    generateEnhancedPDF(res, content, content.eventName);
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).json({ error: "Failed to build PDF" });
  }
};

// ==========================================
// ENHANCED PDF GENERATION FUNCTION
// ==========================================
function generateEnhancedPDF(res, content, filename) {
  const doc = new PDFDocument({
    margin: 0,
    size: "A4",
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename || "proposal"}.pdf"`,
  );
  doc.pipe(res);

  // Draw header
  drawPDFHeader(doc, content.eventName);

  let currentY = 130;

  // ========== EVENT DETAILS GRID ==========
  currentY = drawSectionHeader(doc, "Event Overview", currentY);

  // Row 1: Event Name & Organization
  drawDetailBox(doc, "Event Name", content.eventName, 40, currentY, 255);
  drawDetailBox(doc, "Organization / CCA", content.cca, 305, currentY, 255);
  currentY += 50;

  // Row 2: Start & End Date/Time
  let startDateTime = "—";
  let endDateTime = "—";

  if (content.startDate) {
    startDateTime = formatDateTime(content.startDate, content.startTime);
  }

  if (content.endDate) {
    endDateTime = formatDateTime(content.endDate, content.endTime);
  }

  drawDetailBox(doc, "Start Date & Time", startDateTime, 40, currentY, 255);
  drawDetailBox(doc, "End Date & Time", endDateTime, 305, currentY, 255);
  currentY += 50;

  // Row 3: Venue & Coordinator
  drawDetailBox(doc, "Venue / Location", content.venue, 40, currentY, 255);
  drawDetailBox(
    doc,
    "Chief Coordinator",
    content.chiefCoordinator,
    305,
    currentY,
    255,
  );
  currentY += 50;

  // Row 4: Team Size & Expected Participants
  const teamSize = content.numExcos ? `${content.numExcos} organizers` : "—";
  const participants =
    content.expectedAttendees ||
    content.expectedParticipants ||
    content.expectedDonors ||
    content.expectedCompetitors ||
    "—";

  drawDetailBox(doc, "Team Size", teamSize, 40, currentY, 255);
  drawDetailBox(doc, "Expected Participants", participants, 305, currentY, 255);
  currentY += 60;

  // ========== CONTENT SECTIONS ==========
  const sectionMappings = {
    // Common fields
    purpose: "Purpose & Objectives",
    timeline: "Event Timeline",
    budget: "Budget Breakdown",
    resources: "Resources Needed",
    risks: "Risk Assessment & Mitigation",
    acquisition: "Special Requirements",
    contact: "Contact Information",

    // Academic event fields
    targetAudience: "Target Audience",
    keyTopics: "Key Topics & Agenda",
    duration: "Event Duration",
    assessment: "Assessment Method",
    guestSpeakers: "Guest Speakers",

    // Social event fields
    activities: "Planned Activities",
    decorations: "Decorations & Ambiance",
    catering: "Catering & Refreshments",
    theme: "Event Theme",

    // Fundraising fields
    cause: "Cause / Charity Partner",
    targetAmount: "Fundraising Target",
    fundAllocation: "Fund Allocation Plan",

    // Competition fields
    categories: "Competition Categories",
    rules: "Rules & Regulations",
    prizes: "Prizes & Recognition",
    judging: "Judging Criteria",

    // Performance/Showcase fields
    numPerformers: "Number of Performers",
    performanceSchedule: "Performance Schedule",
    technicalRequirements: "Technical Requirements",
    propsAndCostumes: "Props & Costumes",
    rehearsalSchedule: "Rehearsal Schedule",

    // Outreach fields
    beneficiaryProfile: "Beneficiary Profile",
    trainingPlan: "Volunteer Training Plan",
    riskAssessment: "Risk Assessment",
    impactMetrics: "Impact Metrics",

    // Networking fields
    companies: "Participating Companies",
    sponsorshipPackages: "Sponsorship Packages",
    networkingFormat: "Networking Format",
  };

  // Skip these keys from automatic rendering
  const skipKeys = [
    "eventName",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "cca",
    "chiefCoordinator",
    "venue",
    "numExcos",
    "expectedAttendees",
    "expectedParticipants",
    "expectedDonors",
    "expectedCompetitors",
  ];

  // Render content sections
  Object.keys(content).forEach((key) => {
    if (skipKeys.includes(key)) return;

    const value = content[key];
    if (!value || (typeof value === "string" && value.trim() === "")) return;

    const title =
      sectionMappings[key] ||
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

    currentY = drawContentSection(doc, title, value.toString(), currentY);
  });

  // Finalize the document - this ensures all pages are created
  const range = doc.bufferedPageRange();

  // Now add footers to all existing pages
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    drawPDFFooter(doc, i + 1, range.count);
  }

  doc.end();
}
