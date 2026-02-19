const authController = require("../../src/controllers/auth.controller");
const authModel = require("../../src/models/Auth.model");
const { supabase } = require("../../src/models/supabaseClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 1. Mock all dependencies
jest.mock("../../src/models/Auth.model");
jest.mock("bcrypt");
jest.mock("jsonwebtoken");

jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

describe("Auth Controller - Unit Tests", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure all chainable methods return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.eq.mockReturnThis();

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  // ─── register ─────────────────────────────────────────────────────────────
  describe("register", () => {

    test("TC-UNIT-AUTH-01: Should return 400 if required fields are missing", async () => {
      mockReq = { body: { admin_number: "P1234567" } };

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Missing fields" })
      );
    });

    test("TC-UNIT-AUTH-02: Should return 400 for invalid student admin number format", async () => {
      mockReq = {
        body: {
          admin_number: "INVALID123",
          name: "Test User",
          email: "test@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "student",
        },
      };

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid admin number" })
      );
    });

    test("TC-UNIT-AUTH-03: Should return 400 for non-SP email domain", async () => {
      mockReq = {
        body: {
          admin_number: "P1234567",
          name: "Test User",
          email: "test@gmail.com",
          password: "Password123!",
          user_type: "student",
        },
      };

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Email must be @ichat.sp.edu.sg" })
      );
    });

    test("TC-UNIT-AUTH-04: Should return 409 if admin number is already registered", async () => {
      mockReq = {
        body: {
          admin_number: "P1234567",
          name: "Test User",
          email: "test@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "student",
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue({ user_id: 1, admin_number: "P1234567" });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Admin number already registered" })
      );
    });

    test("TC-UNIT-AUTH-05: Should return 409 if email is already registered", async () => {
      mockReq = {
        body: {
          admin_number: "P9999999",
          name: "Test User",
          email: "existing@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "student",
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue({ user_id: 2, email: "existing@ichat.sp.edu.sg" });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Email already registered" })
      );
    });

    test("TC-UNIT-AUTH-06: Should return 400 if EXCO registers without CCA or secret code", async () => {
      mockReq = {
        body: {
          admin_number: "P1234567",
          name: "EXCO User",
          email: "exco@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "exco",
          // missing cca_id and exco_secret
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "CCA & secret code required" })
      );
    });

    test("TC-UNIT-AUTH-07: Should return 401 if EXCO provides wrong secret code (SPAI CCA)", async () => {
      mockReq = {
        body: {
          admin_number: "P1234567",
          name: "EXCO User",
          email: "exco@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "exco",
          cca_id: 1,
          exco_secret: "WRONGSECRET",
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue(null);

      // Mock the CCA lookup returning SPAI's real secret
      supabase.single.mockResolvedValueOnce({
        data: { exco_secret_code: "EXCO-SPAI-93KF2" },
        error: null,
      });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid Exco Secret Code" })
      );
    });

    test("TC-UNIT-AUTH-08: Should return 400 if teacher registers without CCA or secret code", async () => {
      mockReq = {
        body: {
          admin_number: "S1234567",
          name: "Teacher User",
          email: "teacher@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "teacher",
          // missing cca_id and teacher_secret
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue(null);

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "CCA & Teacher Secret Code required" })
      );
    });

    test("TC-UNIT-AUTH-09: Should return 401 if teacher provides wrong secret code (SPAI CCA)", async () => {
      mockReq = {
        body: {
          admin_number: "S1234567",
          name: "Teacher User",
          email: "teacher@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "teacher",
          cca_id: 1,
          teacher_secret: "WRONGSECRET",
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue(null);

      // Mock the CCA lookup returning SPAI's real teacher secret
      supabase.single.mockResolvedValueOnce({
        data: { teacher_secret_code: "CHER-SPAI-91KK1" },
        error: null,
      });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid Teacher Secret Code" })
      );
    });

    test("TC-UNIT-AUTH-10: Should return 201 and never expose password_hash on successful student registration", async () => {
      mockReq = {
        body: {
          admin_number: "P1234567",
          name: "New Student",
          email: "newstudent@ichat.sp.edu.sg",
          password: "Password123!",
          user_type: "student",
        },
      };

      authModel.getUserByAdminNumber.mockResolvedValue(null);
      authModel.getUserByEmail.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue("hashed_pw");
      authModel.createUser.mockResolvedValue({
        user_id: 99,
        admin_number: "P1234567",
        name: "New Student",
        email: "newstudent@ichat.sp.edu.sg",
        user_type: "student",
        password_hash: "hashed_pw",
      });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseUser = mockRes.json.mock.calls[0][0].user;
      expect(responseUser.admin_number).toBe("P1234567");
      expect(responseUser).not.toHaveProperty("password_hash");
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────
  describe("login", () => {

    test("TC-UNIT-AUTH-11: Should return 401 if user is not found by admin number", async () => {
      mockReq = { body: { admin_number: "P9999999", password: "SomePass" } };

      authModel.getUserByAdminNumber.mockResolvedValue(null);

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid credentials" })
      );
    });

    test("TC-UNIT-AUTH-12: Should return 401 if password does not match", async () => {
      mockReq = { body: { admin_number: "P2424141", password: "WrongPass" } };

      authModel.getUserByAdminNumber.mockResolvedValue({
        user_id: 1,
        admin_number: "P2424141",
        password_hash: "correct_hash",
      });
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid credentials" })
      );
    });

    test("TC-UNIT-AUTH-13: Should return 200 and set httpOnly cookie on valid login", async () => {
      mockReq = { body: { admin_number: "P2424141", password: "Username7656" } };

      authModel.getUserByAdminNumber.mockResolvedValue({
        user_id: 1,
        admin_number: "P2424141",
        user_type: "student",
        password_hash: "correct_hash",
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue("mock_jwt_token");

      await authController.login(mockReq, mockRes);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        "token",
        "mock_jwt_token",
        expect.objectContaining({ httpOnly: true })
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Logged in" })
      );
    });

    test("TC-UNIT-AUTH-14: Should not expose password_hash in login response", async () => {
      mockReq = { body: { admin_number: "P2424141", password: "Username7656" } };

      authModel.getUserByAdminNumber.mockResolvedValue({
        user_id: 1,
        admin_number: "P2424141",
        user_type: "student",
        password_hash: "secret_hash",
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue("mock_jwt");

      await authController.login(mockReq, mockRes);

      const responseBody = mockRes.json.mock.calls[0][0];
      expect(responseBody.user).not.toHaveProperty("password_hash");
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────
  describe("logout", () => {

    test("TC-UNIT-AUTH-15: Should clear token cookie and return logged out message", async () => {
      mockReq = {};

      authController.logout(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith("token");
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Logged out" })
      );
    });
  });

  // ─── getCurrentUser ───────────────────────────────────────────────────────
  describe("getCurrentUser", () => {

    test("TC-UNIT-AUTH-16: Should return 401 if no token cookie is present", async () => {
      mockReq = { cookies: {} };

      authController.getCurrentUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Not authenticated" })
      );
    });

    test("TC-UNIT-AUTH-17: Should return 401 if token is invalid or expired", async () => {
      mockReq = { cookies: { token: "bad_token" } };

      jwt.verify.mockImplementation(() => { throw new Error("Invalid token"); });

      authController.getCurrentUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test("TC-UNIT-AUTH-18: Should return decoded user object for a valid token", async () => {
      mockReq = { cookies: { token: "valid_token" } };

      jwt.verify.mockReturnValue({ id: 1, admin_number: "P2424141", role: "student" });

      authController.getCurrentUser(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ admin_number: "P2424141" }),
        })
      );
    });
  });

  // ─── listCcas ─────────────────────────────────────────────────────────────
  describe("listCcas", () => {

    test("TC-UNIT-AUTH-19: Should return list of CCAs on success", async () => {
      mockReq = {};
      const mockCcas = [
        { cca_id: 1, name: "SP Singapore Polytechnic Artificial Intelligence (SPAI)" },
        { cca_id: 2, name: "Drama Club" },
      ];

      supabase.select.mockResolvedValueOnce({ data: mockCcas, error: null });

      await authController.listCcas(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ ccas: mockCcas });
    });

    test("TC-UNIT-AUTH-20: Should return 500 if database fetch for CCAs fails", async () => {
      mockReq = {};

      supabase.select.mockResolvedValueOnce({
        data: null,
        error: { message: "DB connection error" },
      });

      await authController.listCcas(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Failed to load CCAs" })
      );
    });
  });
});