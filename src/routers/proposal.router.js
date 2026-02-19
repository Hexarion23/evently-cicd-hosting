const express = require("express");
const router = express.Router();
const proposalController = require("../controllers/proposal.controller");

// ===============================
// PROPOSAL CRUD
// ===============================

// GET all proposals for user
router.get("/", proposalController.getUserProposals);

// GENERATE & DOWNLOAD PDF from form data (direct, no save) - must be before /:id routes
router.post("/generate/pdf", proposalController.generatePDFFromFormData);

// GET single proposal
router.get("/:id", proposalController.getProposal);

// CREATE new proposal
router.post("/", proposalController.createProposal);

// UPDATE proposal
router.put("/:id", proposalController.updateProposal);

// DELETE proposal
router.delete("/:id", proposalController.deleteProposal);

// SAVE draft
router.post("/:id/save-draft", proposalController.saveProposalDraft);

// DOWNLOAD proposal as PDF (both saved and direct)
router.get("/:id/download-pdf", proposalController.downloadProposal);

module.exports = router;
