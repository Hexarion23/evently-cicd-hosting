const { supabase } = require("./supabaseClient");

// =====================================================
// GET ALL PROPOSALS FOR A USER
// =====================================================
module.exports.getUserProposals = async function getUserProposals(userId) {
  const { data, error } = await supabase
    .from("event_proposals")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error fetching proposals:", error);
    throw error;
  }
  return data || [];
};

// =====================================================
// GET SINGLE PROPOSAL
// =====================================================
module.exports.getProposalById = async function getProposalById(proposalId) {
  const { data, error } = await supabase
    .from("event_proposals")
    .select("*")
    .eq("proposal_id", proposalId)
    .single();

  if (error) {
    console.error("❌ Error fetching proposal:", error);
    throw error;
  }
  return data;
};

// =====================================================
// CREATE NEW PROPOSAL
// =====================================================
module.exports.createProposal = async function createProposal(proposalData) {
  const { data, error } = await supabase
    .from("event_proposals")
    .insert([
      {
        created_by: proposalData.created_by,
        template_type: proposalData.template_type,
        event_name: proposalData.event_name,
        content: proposalData.content,
        status: "draft",
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating proposal:", error);
    throw error;
  }
  return data;
};

// =====================================================
// UPDATE PROPOSAL
// =====================================================
module.exports.updateProposal = async function updateProposal(proposalId, updates) {
  const { data, error } = await supabase
    .from("event_proposals")
    .update({
      ...updates,
      updated_at: new Date(),
    })
    .eq("proposal_id", proposalId)
    .select()
    .single();

  if (error) {
    console.error("❌ Error updating proposal:", error);
    throw error;
  }
  return data;
};

// =====================================================
// DELETE PROPOSAL
// =====================================================
module.exports.deleteProposal = async function deleteProposal(proposalId) {
  const { error } = await supabase
    .from("event_proposals")
    .delete()
    .eq("proposal_id", proposalId);

  if (error) {
    console.error("❌ Error deleting proposal:", error);
    throw error;
  }
  return true;
};

// =====================================================
// SAVE PROPOSAL DRAFT
// =====================================================
module.exports.saveProposalDraft = async function saveProposalDraft(proposalId, formData) {
  const { data, error } = await supabase
    .from("event_proposals")
    .update({
      content: JSON.stringify(formData),
      status: "draft",
      updated_at: new Date(),
    })
    .eq("proposal_id", proposalId)
    .select()
    .single();

  if (error) {
    console.error("❌ Error saving proposal draft:", error);
    throw error;
  }
  return data;
};
