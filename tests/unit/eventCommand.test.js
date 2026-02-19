const eventController = require("../../src/controllers/event.controller");
const eventModel = require("../../src/models/event.model");
const { supabase } = require("../../src/models/supabaseClient");
const jwt = require("jsonwebtoken");

// 1. Mock Supabase and dependencies
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../../src/models/event.model");
jest.mock("jsonwebtoken");

describe("Event Command Center - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset ALL chainable methods to return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.delete.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.order.mockReturnThis();

    mockReq = {
      cookies: { token: "mock-token" },
      params: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── getEventById ─────────────────────────────────────────────────────────
  describe("getEventById (Event Information)", () => {

    test("TC-UNIT-CMD-01: Should return event details for a valid event ID", async () => {
      mockReq.params.id = "3";

      const mockEvent = {
        event_id: 3,
        title: "Student Ambassador Showcase 2026",
        start_datetime: "2026-02-15T10:00:00",
        location: "Main Hall",
        cca: { name: "SP Singapore Polytechnic Artificial Intelligence (SPAI)" },
      };

      supabase.single.mockResolvedValueOnce({ data: mockEvent, error: null });

      await eventController.getEventById(mockReq, mockRes);

      expect(supabase.from).toHaveBeenCalledWith("event");
      expect(supabase.eq).toHaveBeenCalledWith("event_id", "3");
      expect(mockRes.json).toHaveBeenCalledWith(mockEvent);
    });

    test("TC-UNIT-CMD-02: Should return 404 if event does not exist", async () => {
      mockReq.params.id = "999";

      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Row not found" },
      });

      await eventController.getEventById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Event not found" })
      );
    });
  });

  // ─── signupEvent ──────────────────────────────────────────────────────────
  describe("signupEvent (Signup & Stats)", () => {

    test("TC-UNIT-CMD-03: Should return 400 if event_id or user_id is missing", async () => {
      mockReq.body = { event_id: 3 }; // missing user_id

      await eventController.signupEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Missing fields" })
      );
    });

    test("TC-UNIT-CMD-04: Should return 400 if event is already at full capacity", async () => {
      mockReq.body = { event_id: 3, user_id: 5 };

      /**
       * signupEvent capacity check: .from("event").select().eq().single()
       * single() is the terminal call for the first query
       */
      supabase.single.mockResolvedValueOnce({
        data: { capacity: 50, registered_count: 50 },
        error: null,
      });

      await eventController.signupEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Event full" })
      );
    });

    test("TC-UNIT-CMD-05: Should successfully sign up a user and return 200", async () => {
      mockReq.body = { event_id: 3, user_id: 5 };

      /**
       * signupEvent has TWO supabase calls:
       * 1. .from("event").select().eq().single()       ← capacity check
       * 2. .from("event_signup").insert([...])         ← insert signup
       * Then supabase.rpc(...)                         ← increment count
       *
       * single() resolves call 1. insert() resolves call 2.
       */
      supabase.single.mockResolvedValueOnce({
        data: { capacity: 50, registered_count: 3 },
        error: null,
      });

      supabase.insert.mockResolvedValueOnce({ error: null });

      supabase.rpc.mockResolvedValueOnce({ error: null });

      await eventController.signupEvent(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Signed up" })
      );
    });
  });

  // ─── unsignEvent ──────────────────────────────────────────────────────────
  describe("unsignEvent (Remove Signup)", () => {

    test("TC-UNIT-CMD-06: Should successfully remove signup and return 200", async () => {
      mockReq.body = { event_id: 3, user_id: 5 };

      /**
       * unsignEvent: .from("event_signup").delete().eq("event_id").eq("user_id")
       * Chain: delete() → 'this', first eq() → 'this', second eq() → resolves
       */
      supabase.eq
        .mockReturnValueOnce(supabase)           // .eq("event_id", ...) → this
        .mockResolvedValueOnce({ error: null }); // .eq("user_id", ...)  → resolves

      supabase.rpc.mockResolvedValueOnce({ error: null });

      await eventController.unsignEvent(mockReq, mockRes);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(supabase.delete).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Unsigned" })
      );
    });

    test("TC-UNIT-CMD-07: Should return 500 if deletion from database fails", async () => {
      mockReq.body = { event_id: 3, user_id: 5 };

      supabase.eq
        .mockReturnValueOnce(supabase)                                  // .eq("event_id", ...) → this
        .mockResolvedValueOnce({ error: { message: "Delete failed" } }); // .eq("user_id", ...)  → error

      await eventController.unsignEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // ─── getEventFeedbackAnalysis ─────────────────────────────────────────────
  describe("getEventFeedbackAnalysis (Feedback & Ratings)", () => {

    test("TC-UNIT-CMD-08: Should return stats and comments when feedback exists", async () => {
      mockReq.params.eventId = "3";

      const mockComments = [
        { feedback_id: 1, rating: 5, comment: "Great event!", User: { name: "Alice" } },
        { feedback_id: 2, rating: 4, comment: "Very well organized.", User: { name: "Bob" } },
      ];
      const mockStats = {
        average: "4.5",
        totalResponses: 2,
        distribution: { 4: 1, 5: 1 },
      };

      eventModel.getFeedbackByEvent.mockResolvedValue(mockComments);
      eventModel.getFeedbackStats.mockResolvedValue(mockStats);

      await eventController.getEventFeedbackAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { stats: mockStats, comments: mockComments },
        })
      );
    });

    test("TC-UNIT-CMD-09: Should return zero stats and empty comments when no feedback exists", async () => {
      mockReq.params.eventId = "3";

      eventModel.getFeedbackByEvent.mockResolvedValue([]);
      eventModel.getFeedbackStats.mockResolvedValue(null);

      await eventController.getEventFeedbackAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            stats: { average: 0, totalResponses: 0, distribution: {} },
            comments: [],
          },
        })
      );
    });

    test("TC-UNIT-CMD-10: Should return 500 if feedback query throws an error", async () => {
      mockReq.params.eventId = "3";

      eventModel.getFeedbackByEvent.mockRejectedValue(new Error("DB error"));
      eventModel.getFeedbackStats.mockRejectedValue(new Error("DB error"));

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await eventController.getEventFeedbackAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: "Internal Server Error" })
      );

      consoleSpy.mockRestore();
    });
  });

  // ─── getFeedbackStats (real model logic, supabase still mocked) ───────────
  describe("getFeedbackStats (Rating Calculation)", () => {
    /**
     * eventModel is fully mocked via jest.mock() above.
     * jest.requireActual() loads the REAL module so the calculation
     * logic runs, while supabase remains mocked.
     *
     * getFeedbackStats chain: .from().select().eq()
     * eq() is the TERMINAL call — it resolves with { data, error }
     */

    test("TC-UNIT-CMD-11: Should correctly calculate average rating and distribution", async () => {
      const mockRatings = [{ rating: 5 }, { rating: 5 }, { rating: 2 }];

      // select() returns 'this' (default), eq() resolves with data
      supabase.eq.mockResolvedValueOnce({ data: mockRatings, error: null });

      const realModel = jest.requireActual("../../src/models/event.model");
      const stats = await realModel.getFeedbackStats(3);

      expect(stats.average).toBe("4.0"); // (5+5+2)/3 = 4.0
      expect(stats.totalResponses).toBe(3);
      expect(stats.distribution[5]).toBe(2);
      expect(stats.distribution[2]).toBe(1);
    });

    test("TC-UNIT-CMD-12: Should return null when the event has no feedback", async () => {
      supabase.eq.mockResolvedValueOnce({ data: [], error: null });

      const realModel = jest.requireActual("../../src/models/event.model");
      const stats = await realModel.getFeedbackStats(999);

      expect(stats).toBeNull();
    });
  });

  // ─── deleteEvent ──────────────────────────────────────────────────────────
  describe("deleteEvent", () => {

    test("TC-UNIT-CMD-13: Should successfully delete an event and return 200", async () => {
      mockReq.params.id = "3";

      /**
       * deleteEvent: .from("event").delete().eq("event_id", id)
       * delete() → 'this' (set in beforeEach), eq() → resolves
       */
      supabase.eq.mockResolvedValueOnce({ error: null });

      await eventController.deleteEvent(mockReq, mockRes);

      expect(supabase.from).toHaveBeenCalledWith("event");
      expect(supabase.delete).toHaveBeenCalled();
      expect(supabase.eq).toHaveBeenCalledWith("event_id", "3");
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Deleted" })
      );
    });

    test("TC-UNIT-CMD-14: Should return 500 if event deletion fails", async () => {
      mockReq.params.id = "3";

      /**
       * FIX: In beforeEach, eq() is set to mockReturnThis (returns supabase object).
       * We must override ONLY eq() for this test to resolve with an error.
       * delete() stays as mockReturnThis from beforeEach — no override needed.
       */
      supabase.eq.mockResolvedValueOnce({ error: { message: "Delete failed" } });

      await eventController.deleteEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Delete failed" })
      );
    });
  });

  // ─── updateEvent ──────────────────────────────────────────────────────────
  describe("updateEvent", () => {

    test("TC-UNIT-CMD-15: Should successfully update an event and return 200", async () => {
      mockReq.params.id = "3";
      mockReq.body = { title: "Student Ambassador Showcase 2026 (Updated)" };

      /**
       * updateEvent: .from("event").update(body).eq("event_id", id)
       * update() → 'this' (beforeEach), eq() → resolves
       */
      supabase.eq.mockResolvedValueOnce({ error: null });

      await eventController.updateEvent(mockReq, mockRes);

      expect(supabase.from).toHaveBeenCalledWith("event");
      expect(supabase.update).toHaveBeenCalledWith(mockReq.body);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Updated" })
      );
    });

    test("TC-UNIT-CMD-16: Should return 500 if event update fails", async () => {
      mockReq.params.id = "3";
      mockReq.body = { title: "Updated Title" };

      supabase.eq.mockResolvedValueOnce({ error: { message: "Update failed" } });

      await eventController.updateEvent(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Update failed" })
      );
    });
  });
});