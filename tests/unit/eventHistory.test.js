const request = require("supertest");
const app = require("../../src/app");

// ✅ Controller uses jwt.verify inside getUser(req)
jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

// ✅ Controller uses supabase.from(...)
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const jwt = require("jsonwebtoken");
const { supabase } = require("../../src/models/supabaseClient");

/**
 * Create a chainable Supabase query mock.
 *
 * Why this is mark-maximising:
 * - Your controller has queries that "terminate" at DIFFERENT methods:
 *   - events: .order(...)  -> await resolves there
 *   - signups: .in(...)    -> await resolves there (NO order after)
 *   - users: .in(...)      -> await resolves there (NO order after)
 *   - feedback: .order(...) -> await resolves there
 *
 * So this helper supports BOTH async terminators:
 *   terminal = "order" (default) or "in"
 */
function makeQueryChain(finalResolve, terminal = "order") {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  };

  // Make one method be the async terminator
  chain[terminal] = jest
    .fn()
    .mockImplementation(() => Promise.resolve(finalResolve));

  return chain;
}

describe("GET /api/events/history (Event History + Feedback)", () => {
  const ENDPOINT = "/api/events/history";
  const me = { id: 101, role: "student" };

  beforeEach(() => {
    jest.resetAllMocks(); // prevents mock leakage across tests
  });

  // ------------------------
  // A) Auth
  // ------------------------

  test("401 when no token cookie", async () => {
    const res = await request(app).get(ENDPOINT);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );

    expect(jwt.verify).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("401 when token invalid (jwt.verify throws)", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid token");
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=bad"]);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );

    expect(supabase.from).not.toHaveBeenCalled();
  });

  // ------------------------
  // B) Success: empty
  // ------------------------

  test("200 returns { data: [] } when no past events", async () => {
    jwt.verify.mockReturnValue(me);

    // events query ends at .order(...)
    const qEvents = makeQueryChain({ data: [], error: null }, "order");

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });

    expect(supabase.from).toHaveBeenCalledWith("event");
  });

  // ------------------------
  // C) Success: full payload
  // ------------------------

  test("200 returns normalized history with canReview + feedbackList + userFeedback", async () => {
    jwt.verify.mockReturnValue(me);

    const events = [
      {
        event_id: 11,
        title: "Open House Helper",
        description: "Help visitors",
        start_datetime: "2026-01-01T10:00:00.000Z",
        end_datetime: "2026-01-01T12:00:00.000Z",
        location: "T18",
        cca_points: 10,
      },
      {
        event_id: 12,
        title: "CCA Recruitment",
        description: null,
        start_datetime: "2026-01-02T10:00:00.000Z",
        end_datetime: "2026-01-02T12:00:00.000Z",
        location: null,
        cca_points: 5,
      },
    ];

    // IMPORTANT: your controller checks attendance === "present"
    const signups = [
      { event_id: 11, attendance_status: "present" },
      { event_id: 12, attendance_status: "absent" },
    ];

    const feedbackRows = [
      {
        feedback_id: 1,
        event_id: 11,
        user_id: 101, // me
        rating: 5,
        comment: "W event",
        created_at: "2026-01-03T00:00:00.000Z",
      },
      {
        feedback_id: 2,
        event_id: 11,
        user_id: 202,
        rating: 4,
        comment: "Nice",
        created_at: "2026-01-03T01:00:00.000Z",
      },
      {
        feedback_id: 3,
        event_id: 12,
        user_id: 303,
        rating: 3,
        comment: "",
        created_at: "2026-01-04T00:00:00.000Z",
      },
    ];

    const users = [
      { user_id: 101, name: "Me" },
      { user_id: 202, name: "Alice" },
      { user_id: 303, name: "Bob" },
    ];

    // events: terminates at .order(...)
    const qEvents = makeQueryChain({ data: events, error: null }, "order");
    // signups: terminates at .in(...) in controller (NO order after)
    const qSignups = makeQueryChain({ data: signups, error: null }, "in");
    // feedback: terminates at .order(...)
    const qFeedback = makeQueryChain(
      { data: feedbackRows, error: null },
      "order",
    );
    // users: terminates at .in(...) in controller (NO order after)
    const qUsers = makeQueryChain({ data: users, error: null }, "in");

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      if (table === "event_signup") return qSignups;
      if (table === "event_feedback") return qFeedback;
      if (table === "User") return qUsers;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const ev11 = res.body.data.find((x) => x.id === 11);
    const ev12 = res.body.data.find((x) => x.id === 12);

    expect(ev11).toBeTruthy();
    expect(ev12).toBeTruthy();

    // ✅ canReview logic (matches controller: attendance === "present")
    expect(ev11.canReview).toBe(true);
    expect(ev12.canReview).toBe(false);

    // ✅ userFeedback detection
    expect(ev11.userFeedback).toEqual(
      expect.objectContaining({
        user_id: 101,
        isMine: true,
        userName: "Me",
        rating: 5,
      }),
    );

    // ✅ feedbackList isMine & userName mapping
    expect(ev11.feedbackList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 101, isMine: true, userName: "Me" }),
        expect.objectContaining({
          user_id: 202,
          isMine: false,
          userName: "Alice",
        }),
      ]),
    );

    // ✅ fallback fields normalization
    expect(ev12.description).toBe("");
    expect(ev12.location).toBe("");

    // ✅ ensure controller included attendance_status in payload
    expect(ev11.attendance_status).toBe("present");
    expect(ev12.attendance_status).toBe("absent");
  });

  // ------------------------
  // D) Edge cases
  // ------------------------

  test("attendance_status missing => canReview false (defensive)", async () => {
    jwt.verify.mockReturnValue(me);

    const events = [{ event_id: 50, title: "Past Event", description: null }];

    // attendance_status null => canReview false
    const signups = [{ event_id: 50, attendance_status: null }];

    const qEvents = makeQueryChain({ data: events, error: null }, "order");
    const qSignups = makeQueryChain({ data: signups, error: null }, "in");
    const qFeedback = makeQueryChain({ data: [], error: null }, "order");

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      if (table === "event_signup") return qSignups;
      if (table === "event_feedback") return qFeedback;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].attendance_status).toBeNull();
    expect(res.body.data[0].canReview).toBe(false);
  });

  test("User name lookup fails => still returns feedback with fallback userName 'Student'", async () => {
    jwt.verify.mockReturnValue(me);

    const events = [{ event_id: 60, title: "Past Event", description: null }];
    const signups = [{ event_id: 60, attendance_status: "present" }];

    const feedbackRows = [
      {
        feedback_id: 9,
        event_id: 60,
        user_id: 999,
        rating: 4,
        comment: "ok",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];

    const qEvents = makeQueryChain({ data: events, error: null }, "order");
    const qSignups = makeQueryChain({ data: signups, error: null }, "in");
    const qFeedback = makeQueryChain({ data: feedbackRows, error: null }, "order");

    // User lookup returns error; controller logs and continues with fallback
    const qUsers = makeQueryChain(
      { data: null, error: { message: "users lookup failed" } },
      "in",
    );

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      if (table === "event_signup") return qSignups;
      if (table === "event_feedback") return qFeedback;
      if (table === "User") return qUsers;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    expect(res.body.data[0].feedbackList[0]).toEqual(
      expect.objectContaining({
        user_id: 999,
        userName: "Student",
      }),
    );
  });

  // ------------------------
  // E) Failure paths (500)
  // ------------------------

  test("500 when events query fails", async () => {
    jwt.verify.mockReturnValue(me);

    const qEvents = makeQueryChain(
      { data: null, error: { message: "events query failed" } },
      "order",
    );

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  test("500 when signups query fails", async () => {
    jwt.verify.mockReturnValue(me);

    const events = [{ event_id: 77, title: "Past", description: null }];

    const qEvents = makeQueryChain({ data: events, error: null }, "order");
    // IMPORTANT: terminates at .in(...) in controller
    const qSignups = makeQueryChain(
      { data: null, error: { message: "signups query failed" } },
      "in",
    );

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      if (table === "event_signup") return qSignups;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  test("500 when feedback query fails", async () => {
    jwt.verify.mockReturnValue(me);

    const events = [{ event_id: 88, title: "Past", description: null }];
    const signups = [{ event_id: 88, attendance_status: "present" }];

    const qEvents = makeQueryChain({ data: events, error: null }, "order");
    const qSignups = makeQueryChain({ data: signups, error: null }, "in");
    const qFeedback = makeQueryChain(
      { data: null, error: { message: "feedback query failed" } },
      "order",
    );

    supabase.from.mockImplementation((table) => {
      if (table === "event") return qEvents;
      if (table === "event_signup") return qSignups;
      if (table === "event_feedback") return qFeedback;
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(app).get(ENDPOINT).set("Cookie", ["token=good"]);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
