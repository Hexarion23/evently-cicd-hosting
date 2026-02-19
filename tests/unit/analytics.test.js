const analyticsController = require("../../src/controllers/analytics.controller");
const analyticsModel = require("../../src/models/analytics.model");
const jwt = require("jsonwebtoken");

// 1. Mock all dependencies
jest.mock("../../src/models/analytics.model");
jest.mock("jsonwebtoken");

describe("Analytics Controller - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = { cookies: { token: "mock-token" }, query: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── getMyCca ─────────────────────────────────────────────────────────────
  describe("getMyCca", () => {

    test("TC-UNIT-ANA-01: Should return 401 if no token is present", async () => {
      mockReq = { cookies: {} };

      await analyticsController.getMyCca(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Not authenticated" })
      );
    });

    test("TC-UNIT-ANA-02: Should return 403 if user is not an EXCO of any CCA", async () => {
      jwt.verify.mockReturnValue({ id: 5, admin_number: "P1234567", role: "student" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(null);

      await analyticsController.getMyCca(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "User is not an Exco for any CCA" })
      );
    });

    test("TC-UNIT-ANA-03: Should return CCA id and name for a valid EXCO user", async () => {
      jwt.verify.mockReturnValue({ id: 10, admin_number: "P2424141", role: "exco" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(1);
      analyticsModel.getCcaById.mockResolvedValue({
        cca_id: 1,
        name: "SP Singapore Polytechnic Artificial Intelligence (SPAI)",
      });

      await analyticsController.getMyCca(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        cca_id: 1,
        name: "SP Singapore Polytechnic Artificial Intelligence (SPAI)",
      });
    });
  });

  // ─── getOverview ──────────────────────────────────────────────────────────
  describe("getOverview (KPI Summary)", () => {

    beforeEach(() => {
      // Logged-in EXCO for SPAI (cca_id: 1)
      jwt.verify.mockReturnValue({ id: 10, admin_number: "P2424141", role: "exco" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(1);
    });

    test("TC-UNIT-ANA-04: Should return all KPI fields with valid values", async () => {
      analyticsModel.countMembers.mockResolvedValue(25);
      analyticsModel.countActiveEvents.mockResolvedValue(3);
      analyticsModel.countAllEvents.mockResolvedValue(10);
      analyticsModel.countTotalSignups.mockResolvedValue(80);
      analyticsModel.countTotalAttendance.mockResolvedValue(60);

      await analyticsController.getOverview(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          cca_id: 1,
          members: 25,
          activeEvents: 3,
          allEvents: 10,
          totalSignups: 80,
          attendanceRate: 75, // (60/80)*100 = 75%
        })
      );
    });

    test("TC-UNIT-ANA-05: Should return attendanceRate of 0 when there are no signups", async () => {
      analyticsModel.countMembers.mockResolvedValue(10);
      analyticsModel.countActiveEvents.mockResolvedValue(0);
      analyticsModel.countAllEvents.mockResolvedValue(0);
      analyticsModel.countTotalSignups.mockResolvedValue(0);
      analyticsModel.countTotalAttendance.mockResolvedValue(0);

      await analyticsController.getOverview(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ attendanceRate: 0 })
      );
    });

    test("TC-UNIT-ANA-06: Should correctly calculate attendanceRate as a rounded percentage", async () => {
      analyticsModel.countMembers.mockResolvedValue(20);
      analyticsModel.countActiveEvents.mockResolvedValue(2);
      analyticsModel.countAllEvents.mockResolvedValue(5);
      analyticsModel.countTotalSignups.mockResolvedValue(3);
      analyticsModel.countTotalAttendance.mockResolvedValue(1);

      await analyticsController.getOverview(mockReq, mockRes);

      // (1/3)*100 = 33.33 → rounds to 33
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ attendanceRate: 33 })
      );
    });
  });

  // ─── getSignupTrend ───────────────────────────────────────────────────────
  describe("getSignupTrend", () => {

    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 10, admin_number: "P2424141", role: "exco" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(1);
    });

    test("TC-UNIT-ANA-07: Should return a trend series for the default 6 months", async () => {
      const mockTrend = [
        { label: "2025-09", count: 5 },
        { label: "2025-10", count: 12 },
        { label: "2025-11", count: 8 },
        { label: "2025-12", count: 20 },
        { label: "2026-01", count: 15 },
        { label: "2026-02", count: 3 },
      ];

      analyticsModel.getSignupTrendByMonth.mockResolvedValue(mockTrend);

      await analyticsController.getSignupTrend(mockReq, mockRes);

      expect(analyticsModel.getSignupTrendByMonth).toHaveBeenCalledWith(1, 6);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ series: mockTrend })
      );
    });

    test("TC-UNIT-ANA-08: Should return an empty series when CCA has no signups", async () => {
      analyticsModel.getSignupTrendByMonth.mockResolvedValue([]);

      await analyticsController.getSignupTrend(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ series: [] })
      );
    });
  });

  // ─── getAttendanceBreakdown ───────────────────────────────────────────────
  describe("getAttendanceBreakdown", () => {

    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 10, admin_number: "P2424141", role: "exco" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(1);
    });

    test("TC-UNIT-ANA-09: Should return attended, noShow, and totalSignups correctly", async () => {
      analyticsModel.countTotalSignups.mockResolvedValue(50);
      analyticsModel.countTotalAttendance.mockResolvedValue(35);

      await analyticsController.getAttendanceBreakdown(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          cca_id: 1,
          attended: 35,
          noShow: 15,
          totalSignups: 50,
        })
      );
    });

    test("TC-UNIT-ANA-10: Should return noShow of 0 when everyone attended", async () => {
      analyticsModel.countTotalSignups.mockResolvedValue(20);
      analyticsModel.countTotalAttendance.mockResolvedValue(20);

      await analyticsController.getAttendanceBreakdown(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ attended: 20, noShow: 0 })
      );
    });
  });

  // ─── getTopEventsBySignups ────────────────────────────────────────────────
  describe("getTopEventsBySignups", () => {

    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 10, admin_number: "P2424141", role: "exco" });
      analyticsModel.getExcoCcaIdForUser.mockResolvedValue(1);
    });

    test("TC-UNIT-ANA-11: Should return top events sorted by signups descending", async () => {
      const mockEvents = [
        { event_id: 3, title: "Student Ambassador Showcase 2026", signups: 50, attended: 40 },
        { event_id: 1, title: "AI Workshop", signups: 30, attended: 25 },
        { event_id: 2, title: "Orientation Day", signups: 10, attended: 10 },
      ];

      analyticsModel.getTopEvents.mockResolvedValue(mockEvents);

      await analyticsController.getTopEventsBySignups(mockReq, mockRes);

      expect(analyticsModel.getTopEvents).toHaveBeenCalledWith(1, 5);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ events: mockEvents })
      );
    });

    test("TC-UNIT-ANA-12: Should return empty events array when CCA has no events", async () => {
      analyticsModel.getTopEvents.mockResolvedValue([]);

      await analyticsController.getTopEventsBySignups(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ events: [] })
      );
    });
  });
});