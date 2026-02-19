// tests/unit/dashboard.test.js
const request = require("supertest");
const jwt = require("jsonwebtoken");

// ✅ Must be set BEFORE requiring app/controllers (so auth uses same secret)
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_dashboard";
process.env.DOTENV_CONFIG_QUIET = "true"; // optional: suppress dotenv logs in tests

// ----------------------------
// Mock: engagement.model.js
// ----------------------------
jest.mock("../../src/models/engagement.model", () => ({
  getUserEngagementStats: jest.fn(),
  getRecommendedEventsForUser: jest.fn(),
}));
const engagementModel = require("../../src/models/engagement.model");

// ----------------------------
// Mock: supabaseClient.js
// ----------------------------
// IMPORTANT: jest.mock is hoisted, so the mock function MUST be declared in a hoist-safe way.
let mockSupabaseFrom;

jest.mock("../../src/models/supabaseClient", () => {
  mockSupabaseFrom = jest.fn();

  return {
    supabase: {
      from: (...args) => mockSupabaseFrom(...args),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn(async () => ({ error: null, data: {} })),
          getPublicUrl: jest.fn(() => ({ data: { publicUrl: "http://x" } })),
        })),
      },
      rpc: jest.fn(async () => ({ data: null, error: null })),
    },
  };
});

// Helper: fluent Supabase query mock
function makeSupabaseQueryMock({ data, error }) {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    gte: jest.fn(() => q),
    or: jest.fn(() => q),
    order: jest.fn(() => q),

    // allow: const { data, error } = await q;
    then: (resolve, reject) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  return q;
}

const app = require("../../src/app");

function isChronologicallySortedAscByStartDatetime(arr) {
  for (let i = 1; i < arr.length; i++) {
    const prev = new Date(arr[i - 1].start_datetime).getTime();
    const curr = new Date(arr[i].start_datetime).getTime();
    if (curr < prev) return false;
  }
  return true;
}

describe("Dashboard API (mark-maximising + advanced)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ======================================================
  // 1) DASHBOARD EVENTS: GET /api/events
  // ======================================================
  describe("GET /api/events (dashboard events list)", () => {
    test("premium: uses correct table + approved-only + chronological ordering", async () => {
      const fakeEvents = [
        {
          event_id: 10,
          title: "Approved Event A",
          status: "approved",
          start_datetime: "2026-03-01T10:00:00+08:00",
        },
      ];

      const q = makeSupabaseQueryMock({ data: fakeEvents, error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events");

      expect(res.status).toBe(200);

      expect(mockSupabaseFrom).toHaveBeenCalledTimes(1);
      expect(mockSupabaseFrom).toHaveBeenCalledWith("event");

      expect(q.eq).toHaveBeenCalledWith("status", "approved");
      expect(q.order).toHaveBeenCalledWith("start_datetime", { ascending: true });
    });

    test("returns 200 + array contract", async () => {
      const fakeEvents = [
        {
          event_id: 1,
          title: "Approved Event A",
          status: "approved",
          start_datetime: "2026-03-01T10:00:00+08:00",
        },
        {
          event_id: 2,
          title: "Approved Event B",
          status: "approved",
          start_datetime: "2026-03-02T10:00:00+08:00",
        },
      ];

      const q = makeSupabaseQueryMock({ data: fakeEvents, error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);

      expect(res.body[0]).toHaveProperty("event_id");
      expect(res.body[0]).toHaveProperty("title");
      expect(res.body[0]).toHaveProperty("status");
      expect(res.body[0]).toHaveProperty("start_datetime");
    });

    test("premium: response is chronological asc by start_datetime", async () => {
      const fakeEventsChrono = [
        {
          event_id: 1,
          title: "Event 1",
          status: "approved",
          start_datetime: "2026-03-01T10:00:00+08:00",
        },
        {
          event_id: 2,
          title: "Event 2",
          status: "approved",
          start_datetime: "2026-03-02T09:00:00+08:00",
        },
        {
          event_id: 3,
          title: "Event 3",
          status: "approved",
          start_datetime: "2026-03-10T20:30:00+08:00",
        },
      ];

      const q = makeSupabaseQueryMock({ data: fakeEventsChrono, error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events");

      expect(res.status).toBe(200);
      expect(isChronologicallySortedAscByStartDatetime(res.body)).toBe(true);
      expect(q.order).toHaveBeenCalledWith("start_datetime", { ascending: true });
    });

    test("premium: server-side search applies ilike OR filter", async () => {
      const q = makeSupabaseQueryMock({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events?search=basketball");

      expect(res.status).toBe(200);

      expect(q.or).toHaveBeenCalled();
      const arg = q.or.mock.calls
        .map((c) => String(c[0]))
        .find((s) => s.includes("title.ilike"));

      expect(arg).toContain("title.ilike.%basketball%");
      expect(arg).toContain("description.ilike.%basketball%");
      expect(arg).toContain("location.ilike.%basketball%");
    });

    test("premium: sort=points orders by cca_points desc then start_datetime asc", async () => {
      const q = makeSupabaseQueryMock({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events?sort=points");

      expect(res.status).toBe(200);

      expect(q.order).toHaveBeenCalledWith("cca_points", {
        ascending: false,
        nullsFirst: false,
      });
      expect(q.order).toHaveBeenCalledWith("start_datetime", { ascending: true });
    });

    test("premium: hidePast & hideExpired apply time gating", async () => {
      const q = makeSupabaseQueryMock({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get(
        "/api/events?hidePast=1&hideExpired=1",
      );

      expect(res.status).toBe(200);

      expect(q.gte).toHaveBeenCalledWith("start_datetime", expect.any(String));

      const deadlineOr = q.or.mock.calls
        .map((c) => String(c[0]))
        .find((s) => s.includes("sign_up_deadline.is.null"));

      expect(deadlineOr).toContain("sign_up_deadline.is.null");
      expect(deadlineOr).toContain("sign_up_deadline.gte.");
    });

    test("handles Supabase error -> 500 with message", async () => {
      const q = makeSupabaseQueryMock({
        data: null,
        error: { message: "DB down" },
      });
      mockSupabaseFrom.mockReturnValue(q);

      const res = await request(app).get("/api/events");

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error");
      expect(String(res.body.error)).toContain("DB down");
    });
  });

  // ======================================================
  // 2) DASHBOARD ENGAGEMENT: GET /api/engagement/me
  // ======================================================
  describe("GET /api/engagement/me (dashboard engagement card)", () => {
    test("no cookie -> 401", async () => {
      const res = await request(app).get("/api/engagement/me");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Not authenticated" });
    });

    test("premium: invalid/tampered JWT -> 401", async () => {
      const res = await request(app)
        .get("/api/engagement/me")
        .set("Cookie", ["token=this.is.not.valid"]);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Not authenticated" });
    });

    test("valid cookie -> 200 with stats contract", async () => {
      engagementModel.getUserEngagementStats.mockResolvedValue({
        score: 120,
        level: "Active Participant",
        totalSignups: 5,
        attendedCount: 3,
        upcomingCount: 0,
        distinctEventCount: 5,
      });

      const token = jwt.sign(
        { id: 123, admin_number: "p1234567", role: "student" },
        process.env.JWT_SECRET,
      );

      const res = await request(app)
        .get("/api/engagement/me")
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(200);

      expect(res.body).toHaveProperty("user_id", 123);
      expect(res.body).toHaveProperty("score", 120);
      expect(res.body).toHaveProperty("level", "Active Participant");
      expect(res.body).toHaveProperty("totalSignups", 5);
      expect(res.body).toHaveProperty("attendedCount", 3);
      expect(res.body).toHaveProperty("distinctEventCount", 5);

      expect(engagementModel.getUserEngagementStats).toHaveBeenCalledWith(123);
    });

    test("model failure -> 500", async () => {
      engagementModel.getUserEngagementStats.mockRejectedValue(new Error("boom"));

      const token = jwt.sign(
        { id: 999, admin_number: "p0000000", role: "student" },
        process.env.JWT_SECRET,
      );

      const res = await request(app)
        .get("/api/engagement/me")
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Server error calculating engagement" });
    });
  });

  // ======================================================
  // 3) DASHBOARD RECOMMENDATIONS: GET /api/engagement/recommendations
  // ======================================================
  describe("GET /api/engagement/recommendations (dashboard recommended events)", () => {
    test("premium: no cookie -> 401", async () => {
      const res = await request(app).get(
        "/api/engagement/recommendations?limit=5",
      );
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Not authenticated" });
    });

    test("premium: valid cookie -> 200 contract + respects limit", async () => {
      const mockEvents = [
        { event_id: 1, title: "Rec A" },
        { event_id: 2, title: "Rec B" },
      ];
      engagementModel.getRecommendedEventsForUser.mockResolvedValue(mockEvents);

      const token = jwt.sign(
        { id: 321, admin_number: "p7654321", role: "student" },
        process.env.JWT_SECRET,
      );

      const res = await request(app)
        .get("/api/engagement/recommendations?limit=2")
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(200);

      expect(res.body).toHaveProperty("user_id", 321);
      expect(res.body).toHaveProperty("count", 2);
      expect(res.body).toHaveProperty("events");
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events).toHaveLength(2);

      expect(engagementModel.getRecommendedEventsForUser).toHaveBeenCalledWith(
        321,
        2,
      );
    });

    test("model failure -> 500", async () => {
      engagementModel.getRecommendedEventsForUser.mockRejectedValue(
        new Error("boom"),
      );

      const token = jwt.sign(
        { id: 111, admin_number: "p1111111", role: "student" },
        process.env.JWT_SECRET,
      );

      const res = await request(app)
        .get("/api/engagement/recommendations?limit=5")
        .set("Cookie", [`token=${token}`]);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: "Server error computing recommendations",
      });
    });
  });
});
