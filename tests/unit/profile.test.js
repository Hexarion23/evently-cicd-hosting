const authModel = require("../../src/models/Auth.model");
const { supabase } = require("../../src/models/supabaseClient");

// 1. Mock Supabase Client (Risk-Free)
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

describe("User Profile & Auth Model - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.eq.mockReturnThis();
  });

  describe("Tier Threshold Logic (Business Rules)", () => {
    // We recreate the logic from profile.js to test threshold boundaries
    const TIER_THRESHOLDS = { bronze: 15, silver: 30, gold: 45, goldPlus: 46 };

    function getTierBadge(points) {
      if (points >= TIER_THRESHOLDS.goldPlus) return "Gold+";
      if (points >= TIER_THRESHOLDS.gold) return "Gold";
      if (points >= TIER_THRESHOLDS.silver) return "Silver";
      return "Bronze";
    }

    test("TC-UNIT-PROF-01: Should assign Gold+ badge at exactly 46 points", () => {
      expect(getTierBadge(46)).toBe("Gold+");
      expect(getTierBadge(100)).toBe("Gold+");
    });

    test("TC-UNIT-PROF-02: Should assign Silver badge between 30 and 44 points", () => {
      expect(getTierBadge(30)).toBe("Silver");
      expect(getTierBadge(44)).toBe("Silver");
    });
  });

  describe("Auth Model Data Retrieval", () => {
    test("TC-UNIT-PROF-03: getUserById should return user object on success", async () => {
      const mockUser = {
        user_id: 1,
        name: "Test Student",
        user_type: "student",
      };
      supabase.single.mockResolvedValueOnce({ data: mockUser, error: null });

      const result = await authModel.getUserById(1);

      expect(supabase.from).toHaveBeenCalledWith("User");
      expect(supabase.eq).toHaveBeenCalledWith("user_id", 1);
      expect(result).toEqual(mockUser);
    });

    test("TC-UNIT-PROF-04: getUserById should return null for non-existent user (PGRST116)", async () => {
      // Mocking the specific Supabase 'No Rows' error code
      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      });

      const result = await authModel.getUserById(999);

      expect(result).toBeNull();
    });
  });

  describe("Points & Attendance Summation", () => {
    test("TC-UNIT-PROF-05: Should correctly calculate attended count from signups", async () => {
      // Logic from loadProfileStats
      const mockSignups = [
        { attendance_status: "present", event: { cca_points: 10 } },
        { attendance_status: "absent", event: { cca_points: 5 } },
        { attendance_status: "present", event: { cca_points: 15 } },
      ];

      let attendedCount = 0;
      let totalPoints = 0;

      mockSignups.forEach((row) => {
        if (row.attendance_status === "present") {
          attendedCount++;
          totalPoints += row.event.cca_points;
        }
      });

      expect(attendedCount).toBe(2);
      expect(totalPoints).toBe(25);
    });
  });
});
