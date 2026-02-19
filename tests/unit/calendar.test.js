const eventModel = require("../../src/models/event.model");
const { supabase } = require("../../src/models/supabaseClient");

// 1. Mock Supabase Client
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

describe("Calendar (Event Model) - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure all chainable methods return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.delete.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.gte.mockReturnThis();
    supabase.order.mockReturnThis();
  });

  // ─── getAllEvents ──────────────────────────────────────────────────────────
  describe("getAllEvents", () => {

    test("TC-UNIT-CAL-01: Should return all events ordered by start_datetime ascending", async () => {
      const mockEvents = [
        { event_id: 1, title: "Orientation Day",          start_datetime: "2026-01-10T09:00:00" },
        { event_id: 2, title: "AI Workshop",               start_datetime: "2026-02-15T14:00:00" },
        { event_id: 3, title: "Student Ambassador Showcase 2026", start_datetime: "2026-03-01T10:00:00" },
      ];

      supabase.order.mockResolvedValueOnce({ data: mockEvents, error: null });

      const result = await eventModel.getAllEvents();

      expect(supabase.from).toHaveBeenCalledWith("event");
      expect(supabase.order).toHaveBeenCalledWith("start_datetime", { ascending: true });
      expect(result).toEqual(mockEvents);
    });

    test("TC-UNIT-CAL-02: Should return an empty array when there are no events", async () => {
      supabase.order.mockResolvedValueOnce({ data: [], error: null });

      const result = await eventModel.getAllEvents();

      expect(result).toEqual([]);
    });

    test("TC-UNIT-CAL-03: Should throw an error if the database call fails", async () => {
      supabase.order.mockResolvedValueOnce({
        data: null,
        error: { message: "DB connection error" },
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(eventModel.getAllEvents()).rejects.toBeTruthy();

      consoleSpy.mockRestore();
    });
  });

  // ─── getUpcomingEvents ────────────────────────────────────────────────────
  describe("getUpcomingEvents", () => {

    test("TC-UNIT-CAL-04: Should only return events with start_datetime in the future", async () => {
      const futureEvents = [
        { event_id: 5, title: "Future Hackathon", start_datetime: "2026-12-01T09:00:00" },
      ];

      supabase.order.mockResolvedValueOnce({ data: futureEvents, error: null });

      const result = await eventModel.getUpcomingEvents();

      expect(supabase.gte).toHaveBeenCalled(); // filters by future date
      expect(result).toEqual(futureEvents);
    });

    test("TC-UNIT-CAL-05: Should return empty array when no upcoming events exist", async () => {
      supabase.order.mockResolvedValueOnce({ data: [], error: null });

      const result = await eventModel.getUpcomingEvents();

      expect(result).toEqual([]);
    });
  });

  // ─── getEventById ─────────────────────────────────────────────────────────
  describe("getEventById", () => {

    test("TC-UNIT-CAL-06: Should return the correct event when given a valid ID", async () => {
      const mockEvent = {
        event_id: 3,
        title: "Student Ambassador Showcase 2026",
        start_datetime: "2026-02-15T10:00:00",
        location: "Main Hall",
        cca_points: 5,
      };

      supabase.single.mockResolvedValueOnce({ data: mockEvent, error: null });

      const result = await eventModel.getEventById(3);

      expect(supabase.from).toHaveBeenCalledWith("event");
      expect(supabase.eq).toHaveBeenCalledWith("event_id", 3);
      expect(result).toEqual(mockEvent);
    });

    test("TC-UNIT-CAL-07: Should throw an error if event ID does not exist", async () => {
      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Row not found", code: "PGRST116" },
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(eventModel.getEventById(999)).rejects.toBeTruthy();

      consoleSpy.mockRestore();
    });
  });

  // ─── getSignupCount ───────────────────────────────────────────────────────
  describe("getSignupCount", () => {

    test("TC-UNIT-CAL-08: Should return the correct number of signups for an event", async () => {
      /**
       * getSignupCount uses: supabase.from().select('*', { count: 'exact', head: true }).eq()
       * The last method in the chain is .eq(), which resolves with { count, error }
       */
      supabase.eq.mockResolvedValueOnce({ count: 3, error: null });

      const result = await eventModel.getSignupCount(3);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(result).toBe(3);
    });

    test("TC-UNIT-CAL-09: Should return 0 when no one has signed up for the event", async () => {
      supabase.eq.mockResolvedValueOnce({ count: 0, error: null });

      const result = await eventModel.getSignupCount(999);

      expect(result).toBe(0);
    });
  });

  // ─── addSignup ────────────────────────────────────────────────────────────
  describe("addSignup", () => {

    test("TC-UNIT-CAL-10: Should successfully add a signup and return true", async () => {
      supabase.insert.mockResolvedValueOnce({ error: null });

      const result = await eventModel.addSignup(1, 5);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(supabase.insert).toHaveBeenCalledWith([{ event_id: 1, user_id: 5 }]);
      expect(result).toBe(true);
    });

    test("TC-UNIT-CAL-11: Should throw an error if the signup insert fails", async () => {
      supabase.insert.mockResolvedValueOnce({
        error: { message: "Duplicate entry" },
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(eventModel.addSignup(1, 5)).rejects.toBeTruthy();

      consoleSpy.mockRestore();
    });
  });

  // ─── removeSignup ─────────────────────────────────────────────────────────
  describe("removeSignup", () => {

    test("TC-UNIT-CAL-12: Should successfully remove a signup and return true", async () => {
      /**
       * removeSignup chains: .from().delete().eq().eq()
       * The second .eq() is the last call and resolves the promise
       */
      supabase.eq
        .mockReturnValueOnce(supabase)      // First .eq("event_id", ...)
        .mockResolvedValueOnce({ error: null }); // Second .eq("user_id", ...)

      const result = await eventModel.removeSignup(1, 5);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(supabase.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test("TC-UNIT-CAL-13: Should throw an error if the database deletion fails", async () => {
      supabase.eq
        .mockReturnValueOnce(supabase)
        .mockResolvedValueOnce({ error: { message: "Delete failed" } });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(eventModel.removeSignup(1, 5)).rejects.toBeTruthy();

      consoleSpy.mockRestore();
    });
  });
});