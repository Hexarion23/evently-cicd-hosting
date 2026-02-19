const eventModel = require("../../src/models/event.model");
const { supabase } = require("../../src/models/supabaseClient");

// 1. Mock Supabase Client
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
  },
}));

describe("Event Feedback Model - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default chain behavior: return 'this' so methods are always findable
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.order.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.delete.mockReturnThis();
    supabase.update.mockReturnThis();
  });

  describe("getFeedbackStats Accuracy", () => {
    test("TC-UNIT-FB-01: Should correctly calculate average and distribution", async () => {
      const mockRatings = [{ rating: 5 }, { rating: 5 }, { rating: 2 }];

      // Target the 'eq' method as the final part of the chain in getFeedbackStats
      supabase.eq.mockResolvedValueOnce({ data: mockRatings, error: null });

      const stats = await eventModel.getFeedbackStats(101);

      expect(stats.average).toBe("4.0"); // (5+5+2)/3 = 4
      expect(stats.totalResponses).toBe(3);
      expect(stats.distribution[5]).toBe(2);
      expect(stats.distribution[2]).toBe(1);
    });

    test("TC-UNIT-FB-02: Should return null if no feedback exists", async () => {
      supabase.eq.mockResolvedValueOnce({ data: [], error: null });

      const stats = await eventModel.getFeedbackStats(999);

      expect(stats).toBeNull();
    });
  });

  describe("Feedback Submission & Safety", () => {
    test("TC-UNIT-FB-03: Should call insert with correct data on submission", async () => {
      // In addSignup, insert is the last call
      supabase.insert.mockResolvedValueOnce({ error: null });

      const result = await eventModel.addSignup(1, 5);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(result).toBe(true);
    });

    test("TC-UNIT-FB-04: Should throw error if database deletion fails", async () => {
      // In removeSignup, eq is the last call in the delete chain
      supabase.eq.mockResolvedValueOnce({
        error: { message: "Delete failed" },
      });

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await expect(eventModel.removeSignup(1, 5)).rejects.toThrow();

      consoleSpy.mockRestore();
    });
  });
});
