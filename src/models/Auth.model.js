import { supabase } from './supabaseClient.js';

async function createUser({ admin_number, name, email, password_hash, user_type, avatar }) {
  const payload = { admin_number, name, email, password_hash, user_type };
  if (avatar) payload.avatar = avatar;

  const { data, error } = await supabase
    .from("User")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("email", email)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function getUserByAdminNumber(admin_number) {
  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("admin_number", admin_number)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("user_id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

export {
  createUser,
  getUserByEmail,
  getUserByAdminNumber,
  getUserById,
};
