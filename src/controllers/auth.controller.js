const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  createUser,
  getUserByEmail,
  getUserByAdminNumber,
  getUserById,
} = require("../models/Auth.model");

const { supabase } = require("../models/supabaseClient");

const JWT_SECRET = process.env.JWT_SECRET;

// =======================================================
// REGISTER
// =======================================================

async function register(req, res, next) {
  try {
    const {
      admin_number,
      name,
      email,
      password,
      user_type,
      avatar,
      cca_id,
      exco_secret,
      teacher_secret // <--- ADDED: Capture teacher secret from request
    } = req.body;

    if (!admin_number || !name || !email || !password || !user_type)
      return res.status(400).json({ error: "Missing fields" });

    // ** MODIFIED ID VALIDATION **
    // Only enforce strict P-number format for students and exco. 
    // Teachers (Staff) may have different ID formats (e.g. starting with S).
    if (user_type !== 'teacher') {
        if (!/^P\d{7}$/.test(admin_number))
            return res.status(400).json({ error: "Invalid admin number" });
    }

    if (!/@ichat\.sp\.edu\.sg$/.test(email))
      return res.status(400).json({ error: "Email must be @ichat.sp.edu.sg" });

    // Duplicate check
    if (await getUserByAdminNumber(admin_number))
      return res.status(409).json({ error: "Admin number already registered" });

    if (await getUserByEmail(email))
      return res.status(409).json({ error: "Email already registered" });

    // **EXCO SECRET CODE VALIDATION**
    if (user_type === "exco") {
      if (!cca_id || !exco_secret)
        return res.status(400).json({ error: "CCA & secret code required" });

      // Pull secret from DB
      const { data: cca, error: ccaError } = await supabase
        .from("cca")
        .select("exco_secret_code")
        .eq("cca_id", cca_id)
        .single();

      if (ccaError || !cca)
        return res.status(400).json({ error: "Invalid CCA" });

      if (exco_secret !== cca.exco_secret_code)
        // IMPORTANT: exact message so the frontend shows popup
        return res.status(401).json({ error: "Invalid Exco Secret Code" });
    }

    // **TEACHER SECRET CODE VALIDATION (NEW)**
    if (user_type === "teacher") {
        if (!cca_id || !teacher_secret)
            return res.status(400).json({ error: "CCA & Teacher Secret Code required" });

        // Check against 'teacher_secret_code' column in DB
        const { data: cca, error: ccaError } = await supabase
            .from("cca")
            .select("teacher_secret_code")
            .eq("cca_id", cca_id)
            .single();

        if (ccaError || !cca) return res.status(400).json({ error: "Invalid CCA" });

        // Verify the secret code matches
        if (teacher_secret !== cca.teacher_secret_code) {
            return res.status(401).json({ error: "Invalid Teacher Secret Code" });
        }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const user = await createUser({
      admin_number,
      name,
      email,
      password_hash,
      user_type,
      avatar,
    });

    if (!user) return res.status(500).json({ error: "Failed to create user" });

    // Create membership (student → member, exco → exco, teacher → teacher)
    if (cca_id) {
      // Determine role based on user_type
      let role = "member";
      if (user_type === "exco") role = "exco";
      if (user_type === "teacher") role = "teacher";

      const { error: memError } = await supabase
        .from("cca_membership")
        .insert({
          user_id: user.user_id,
          cca_id: Number(cca_id),
          role: role,
        });

      if (memError)
        return res.status(500).json({ error: "Failed to assign CCA" });
    }

    delete user.password_hash;

    return res.status(201).json({ message: "Registered", user });
  } catch (err) {
    next(err);
  }
}

// =======================================================
// GET CCAs
// =======================================================

async function listCcas(req, res) {
  const { data, error } = await supabase
    .from("cca")
    .select("cca_id,name,description,logo_path");

  if (error) return res.status(500).json({ error: "Failed to load CCAs" });

  return res.json({ ccas: data });
}

// =======================================================
// LOGIN
// =======================================================

async function login(req, res) {
  try {
    const { admin_number, email, password } = req.body;

    const user = admin_number
      ? await getUserByAdminNumber(admin_number)
      : await getUserByEmail(email);

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const good = await bcrypt.compare(password, user.password_hash);
    if (!good) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user.user_id,
        admin_number: user.admin_number,
        role: user.user_type,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    delete user.password_hash;

    return res.json({ message: "Logged in", user });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

// =======================================================
// LOGOUT
// =======================================================

function logout(req, res) {
  res.clearCookie("token");
  return res.json({ message: "Logged out" });
}

// =======================================================
// CURRENT USER
// =======================================================

function getCurrentUser(req, res) {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const decoded = jwt.verify(token, JWT_SECRET);

    return res.json({ user: decoded });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// =======================================================
// PROFILE
// =======================================================

async function getUserProfile(req, res) {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id);

    if (!user) return res.status(404).json({ error: "User not found" });

    delete user.password_hash;

    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  getUserProfile,
  listCcas,
};