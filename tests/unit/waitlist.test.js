// tests/unit/waitlist.test.js
const request = require("supertest");
const jwt = require("jsonwebtoken");

// ✅ Must be set BEFORE requiring app/controllers
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test_secret_waitlist";
process.env.DOTENV_CONFIG_QUIET = "true";

// --------------------------------------------------
// Mock: waitlist.model.js (controller uses these)
// --------------------------------------------------
jest.mock("../../src/models/waitlist.model", () => ({
  removeUserFromWaitlist: jest.fn(),
  getWaitlistWithUserInfo: jest.fn(),

  // promotion flow + admin
  clearExpiredPromotionsForEvent: jest.fn(),
  getNextUnofferedCandidate: jest.fn(),
  markPromotionOffered: jest.fn(),
  getActivePromotionForUser: jest.fn(),
  markPromotionAccepted: jest.fn(),
  removeWaitlistEntry: jest.fn(),
  getWaitlistEntryById: jest.fn(),
  clearPromotion: jest.fn(),
}));
const waitlistModel = require("../../src/models/waitlist.model");

// --------------------------------------------------
// Mock: supabaseClient.js (controller uses supabase directly)
// --------------------------------------------------
let mockSupabaseFrom;

jest.mock("../../src/models/supabaseClient", () => {
  mockSupabaseFrom = jest.fn();

  return {
    supabase: {
      from: (...args) => mockSupabaseFrom(...args),
      rpc: jest.fn(async () => ({ data: null, error: null })),
      storage: { from: jest.fn(() => ({})) },
    },
  };
});

// Helper: fluent Supabase query mock (supports await q)
function makeSupabaseQueryMock({ data, error, count } = {}) {
  const q = {
    // chainable
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    maybeSingle: jest.fn(() => q),
    single: jest.fn(() => q),
    order: jest.fn(() => q),
    limit: jest.fn(() => q),
    gt: jest.fn(() => q),
    lt: jest.fn(() => q),
    is: jest.fn(() => q),
    in: jest.fn(() => q),

    insert: jest.fn(() => q),
    update: jest.fn(() => q),
    delete: jest.fn(() => q),

    // makes: const { data, error, count } = await q;
    then: (resolve, reject) =>
      Promise.resolve({ data, error, count }).then(resolve, reject),
  };
  return q;
}

const app = require("../../src/app");

function makeToken(userPayload = { id: 123, role: "student" }) {
  return jwt.sign(userPayload, process.env.JWT_SECRET);
}

describe("Waitlist API (advanced)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ======================================================
  // 1) POST /api/waitlist/join
  // ======================================================
  describe("POST /api/waitlist/join", () => {
    test("400: missing eventId -> Invalid request", async () => {
      const token = makeToken({ id: 10 });

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({}); // no eventId

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request" });
    });

    test("400: missing token -> Invalid request", async () => {
      const res = await request(app)
        .post("/api/waitlist/join")
        .send({ eventId: 55 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request" });
    });

    test("404: event not found", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: null,
        error: { message: "not found" },
      });
      mockSupabaseFrom.mockImplementationOnce(() => qEvent); // from("event")

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Event not found" });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("event");
      expect(qEvent.eq).toHaveBeenCalledWith("event_id", 55);
      expect(qEvent.single).toHaveBeenCalled();
    });

    test("403: organiser cannot join own event", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 1,
          sign_up_deadline: null,
          cca_id: null,
          created_by: 10, // organiser = same user
        },
        error: null,
      });
      mockSupabaseFrom.mockImplementationOnce(() => qEvent); // event

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        "error",
        "Organisers cannot join the waitlist for their own event",
      );
    });

    test("403: EXCO cannot join own CCA event", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 1,
          sign_up_deadline: null,
          cca_id: 999,
          created_by: 777,
        },
        error: null,
      });

      const qMembership = makeSupabaseQueryMock({
        data: { role: "EXCO President" },
        error: null,
      });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent) // event
        .mockImplementationOnce(() => qMembership); // cca_membership

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("EXCO members cannot join");

      expect(mockSupabaseFrom).toHaveBeenCalledWith("cca_membership");
      expect(qMembership.eq).toHaveBeenCalledWith("user_id", 10);
      expect(qMembership.eq).toHaveBeenCalledWith("cca_id", 999);
      expect(qMembership.maybeSingle).toHaveBeenCalled();
    });

    test("403: sign-up deadline passed", async () => {
      const token = makeToken({ id: 10 });

      const past = new Date(Date.now() - 60_000).toISOString();

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 1,
          sign_up_deadline: past,
          cca_id: null,
          created_by: 777,
        },
        error: null,
      });

      mockSupabaseFrom.mockImplementationOnce(() => qEvent); // event

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "Sign-up deadline has passed for this event",
      });
    });

    test("400: event still has slots (not full) -> direct signup message", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 10,
          sign_up_deadline: null,
          cca_id: null,
          created_by: 777,
        },
        error: null,
      });

      // getRegisteredCount uses: from("event_signup").select("*",{count:"exact",head:true}).eq(...)
      const qCount = makeSupabaseQueryMock({
        data: null,
        error: null,
        count: 2, // registeredCount < capacity => not full
      });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent) // event
        .mockImplementationOnce(() => qCount); // event_signup count

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: "Event still has available slots. You can sign up directly.",
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("event_signup");
      expect(qCount.select).toHaveBeenCalledWith("*", {
        count: "exact",
        head: true,
      });
      expect(qCount.eq).toHaveBeenCalledWith("event_id", 55);
    });

    test("400: already on waitlist (duplicate)", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 2,
          sign_up_deadline: null,
          cca_id: null,
          created_by: 777,
        },
        error: null,
      });

      const qCount = makeSupabaseQueryMock({
        data: null,
        error: null,
        count: 2, // full (2 >= 2)
      });

      const qExisting = makeSupabaseQueryMock({
        data: { waitlist_id: 999 },
        error: null,
      });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent) // event
        .mockImplementationOnce(() => qCount) // event_signup count
        .mockImplementationOnce(() => qExisting); // event_waitlist existing

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: "You are already on the waitlist for this event",
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("event_waitlist");
      expect(qExisting.eq).toHaveBeenCalledWith("event_id", 55);
      expect(qExisting.eq).toHaveBeenCalledWith("user_id", 10);
      expect(qExisting.maybeSingle).toHaveBeenCalled();
    });

    test("500: insert waitlist fails -> Failed to join waitlist", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 2,
          sign_up_deadline: null,
          cca_id: null,
          created_by: 777,
        },
        error: null,
      });

      const qCount = makeSupabaseQueryMock({
        data: null,
        error: null,
        count: 2, // full
      });

      const qExisting = makeSupabaseQueryMock({
        data: null,
        error: null, // not existing
      });

      const qInsert = makeSupabaseQueryMock({
        data: null,
        error: { message: "insert fail" },
      });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent) // event
        .mockImplementationOnce(() => qCount) // signup count
        .mockImplementationOnce(() => qExisting) // existing
        .mockImplementationOnce(() => qInsert); // insert

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to join waitlist" });
    });

    test("200: success -> Successfully added to waitlist", async () => {
      const token = makeToken({ id: 10 });

      const qEvent = makeSupabaseQueryMock({
        data: {
          event_id: 55,
          capacity: 2,
          sign_up_deadline: null,
          cca_id: null,
          created_by: 777,
        },
        error: null,
      });

      const qCount = makeSupabaseQueryMock({
        data: null,
        error: null,
        count: 2, // full
      });

      const qExisting = makeSupabaseQueryMock({
        data: null,
        error: null,
      });

      const qInsert = makeSupabaseQueryMock({
        data: { ok: true },
        error: null,
      });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent)
        .mockImplementationOnce(() => qCount)
        .mockImplementationOnce(() => qExisting)
        .mockImplementationOnce(() => qInsert);

      const res = await request(app)
        .post("/api/waitlist/join")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Successfully added to waitlist" });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("event_waitlist");
      expect(qInsert.insert).toHaveBeenCalled();
    });
  });

  // ======================================================
  // 2) POST /api/waitlist/cancel
  // ======================================================
  describe("POST /api/waitlist/cancel", () => {
    test("400: missing eventId or token -> Invalid request", async () => {
      const token = makeToken({ id: 10 });

      const res = await request(app)
        .post("/api/waitlist/cancel")
        .set("Cookie", [`token=${token}`])
        .send({}); // no eventId

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request" });
    });

    test("200: student cancels own waitlist entry", async () => {
      const token = makeToken({ id: 10 });

      waitlistModel.removeUserFromWaitlist.mockResolvedValue(true);
      waitlistModel.clearExpiredPromotionsForEvent.mockResolvedValue(true);

      // offerNextPromotion queries event capacity + signup count
      const qEvent = makeSupabaseQueryMock({
        data: { capacity: 0 }, // registeredCount >= capacity => no promote
        error: null,
      });
      const qCount = makeSupabaseQueryMock({ data: null, error: null, count: 0 });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEvent) // event (capacity)
        .mockImplementationOnce(() => qCount); // event_signup count

      const res = await request(app)
        .post("/api/waitlist/cancel")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(200);
      expect(waitlistModel.removeUserFromWaitlist).toHaveBeenCalledWith(55, 10);
      expect(res.body).toEqual({ message: "Removed from waitlist" });
    });

    test("200: EXCO cancels another user when user_id provided", async () => {
      const token = makeToken({ id: 99 });

      waitlistModel.removeUserFromWaitlist.mockResolvedValue(true);
      waitlistModel.clearExpiredPromotionsForEvent.mockResolvedValue(true);

      // event to get cca_id
      const qEventCca = makeSupabaseQueryMock({
        data: { cca_id: 999 },
        error: null,
      });

      // membership exco
      const qMembership = makeSupabaseQueryMock({
        data: { role: "exco vice" },
        error: null,
      });

      // offerNextPromotion: capacity + count => early return
      const qEventCap = makeSupabaseQueryMock({
        data: { capacity: 0 },
        error: null,
      });
      const qCount = makeSupabaseQueryMock({ data: null, error: null, count: 0 });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEventCca) // event cca_id
        .mockImplementationOnce(() => qMembership) // cca_membership
        .mockImplementationOnce(() => qEventCap) // event capacity
        .mockImplementationOnce(() => qCount); // signup count

      const res = await request(app)
        .post("/api/waitlist/cancel")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55, user_id: 10 });

      expect(res.status).toBe(200);
      expect(waitlistModel.removeUserFromWaitlist).toHaveBeenCalledWith(55, 10);
      expect(res.body).toEqual({ message: "User removed from waitlist" });
    });

    test("500: model failure -> Failed to cancel waitlist entry", async () => {
      const token = makeToken({ id: 10 });

      waitlistModel.removeUserFromWaitlist.mockRejectedValue(new Error("boom"));

      const res = await request(app)
        .post("/api/waitlist/cancel")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to cancel waitlist entry" });
    });
  });

  // ======================================================
  // 3) POST /api/waitlist/accept
  // ======================================================
  describe("POST /api/waitlist/accept", () => {
    test("400: invalid request (missing token/eventId)", async () => {
      const res = await request(app).post("/api/waitlist/accept").send({ eventId: 55 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request" });
    });

    test("400: no active promotion -> Promotion expired or invalid", async () => {
      const token = makeToken({ id: 10 });

      waitlistModel.getActivePromotionForUser.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/waitlist/accept")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Promotion expired or invalid" });
      expect(waitlistModel.getActivePromotionForUser).toHaveBeenCalledWith(55, 10);
    });

    test("500: signup insert fails -> Failed to confirm sign-up", async () => {
      const token = makeToken({ id: 10 });

      waitlistModel.getActivePromotionForUser.mockResolvedValue({
        waitlist_id: 999,
        event_id: 55,
        user_id: 10,
      });
      waitlistModel.markPromotionAccepted.mockResolvedValue(true);

      const qInsertSignup = makeSupabaseQueryMock({
        data: null,
        error: { message: "insert failed" },
      });
      mockSupabaseFrom.mockImplementationOnce(() => qInsertSignup); // from("event_signup")

      const res = await request(app)
        .post("/api/waitlist/accept")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to confirm sign-up" });
    });

    test("200: accepts promotion (mark accepted + signup insert + remove waitlist entry)", async () => {
      const token = makeToken({ id: 10 });

      waitlistModel.getActivePromotionForUser.mockResolvedValue({
        waitlist_id: 999,
        event_id: 55,
        user_id: 10,
      });
      waitlistModel.markPromotionAccepted.mockResolvedValue(true);
      waitlistModel.removeWaitlistEntry.mockResolvedValue(true);

      const qInsertSignup = makeSupabaseQueryMock({ data: [{ ok: true }], error: null });
      mockSupabaseFrom.mockImplementationOnce(() => qInsertSignup); // event_signup insert

      const res = await request(app)
        .post("/api/waitlist/accept")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Promotion accepted — signed up!" });

      expect(waitlistModel.markPromotionAccepted).toHaveBeenCalledWith(999);
      expect(mockSupabaseFrom).toHaveBeenCalledWith("event_signup");
      expect(qInsertSignup.insert).toHaveBeenCalled();
      expect(waitlistModel.removeWaitlistEntry).toHaveBeenCalledWith(999);
    });
  });

  // ======================================================
  // 4) POST /api/waitlist/unsign
  // ======================================================
  describe("POST /api/waitlist/unsign", () => {
    test("400: invalid request", async () => {
      const token = makeToken({ id: 10 });
      const res = await request(app)
        .post("/api/waitlist/unsign")
        .set("Cookie", [`token=${token}`])
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid request" });
    });

    test("200: unsign deletes signup + triggers promotion attempt", async () => {
      const token = makeToken({ id: 10 });

      // delete event_signup
      const qDelete = makeSupabaseQueryMock({ data: null, error: null });

      // offerNextPromotion path: clearExpiredPromotionsForEvent + event capacity + signup count
      waitlistModel.clearExpiredPromotionsForEvent.mockResolvedValue(true);
      const qEventCap = makeSupabaseQueryMock({ data: { capacity: 0 }, error: null });
      const qCount = makeSupabaseQueryMock({ data: null, error: null, count: 0 });

      mockSupabaseFrom
        .mockImplementationOnce(() => qDelete) // from("event_signup").delete...
        .mockImplementationOnce(() => qEventCap) // from("event") capacity
        .mockImplementationOnce(() => qCount); // from("event_signup") count

      const res = await request(app)
        .post("/api/waitlist/unsign")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: "Un-signed successfully. Next user promoted if applicable.",
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith("event_signup");
      expect(qDelete.delete).toHaveBeenCalled();
    });

    test("500: unsign failure", async () => {
      const token = makeToken({ id: 10 });

      const qDelete = makeSupabaseQueryMock({
        data: null,
        error: { message: "db down" },
      });

      // if supabase delete yields error, controller still doesn't check error
      // BUT this test ensures catch branch works for thrown failures:
      // we force delete().eq() chain to throw by making mockSupabaseFrom throw.
      mockSupabaseFrom.mockImplementationOnce(() => {
        throw new Error("boom");
      });

      const res = await request(app)
        .post("/api/waitlist/unsign")
        .set("Cookie", [`token=${token}`])
        .send({ eventId: 55 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to unsign" });
    });
  });

  // ======================================================
  // 5) GET /api/waitlist/:eventId
  // ======================================================
  describe("GET /api/waitlist/:eventId", () => {
    test("200: returns waitlist list contract", async () => {
      waitlistModel.getWaitlistWithUserInfo.mockResolvedValue([
        { waitlist_id: 1, user_id: 10, joined_at: "2026-02-18T00:00:00Z" },
      ]);

      const res = await request(app).get("/api/waitlist/55");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("event_id", "55");
      expect(res.body).toHaveProperty("waitlist");
      expect(Array.isArray(res.body.waitlist)).toBe(true);
      expect(waitlistModel.getWaitlistWithUserInfo).toHaveBeenCalledWith("55");
    });

    test("500: model failure -> Failed to load waitlist", async () => {
      waitlistModel.getWaitlistWithUserInfo.mockRejectedValue(new Error("boom"));

      const res = await request(app).get("/api/waitlist/55");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to load waitlist" });
    });
  });

  // ======================================================
  // 6) POST /api/waitlist/promote-manual
  // ======================================================
  describe("POST /api/waitlist/promote-manual", () => {
    test("404: waitlist entry not found", async () => {
      waitlistModel.getWaitlistEntryById.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/waitlist/promote-manual")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Waitlist entry not found" });
    });

    test("200: manual promotion sends offer + notification", async () => {
      waitlistModel.getWaitlistEntryById.mockResolvedValue({
        waitlist_id: 999,
        user_id: 10,
        event_id: 55,
      });
      waitlistModel.markPromotionOffered.mockResolvedValue(true);

      // createPromotionNotification reads event title then inserts notification
      const qEventTitle = makeSupabaseQueryMock({
        data: { title: "Basketball Night" },
        error: null,
      });
      const qNotifInsert = makeSupabaseQueryMock({ data: [{ ok: true }], error: null });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEventTitle) // from("event").select("title").eq().single()
        .mockImplementationOnce(() => qNotifInsert); // from("notification").insert()

      const res = await request(app)
        .post("/api/waitlist/promote-manual")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Manual promotion sent." });

      expect(waitlistModel.markPromotionOffered).toHaveBeenCalledWith(
        999,
        expect.any(String),
      );
      expect(mockSupabaseFrom).toHaveBeenCalledWith("event");
      expect(mockSupabaseFrom).toHaveBeenCalledWith("notification");
    });

    test("500: manual promote failure", async () => {
      waitlistModel.getWaitlistEntryById.mockRejectedValue(new Error("boom"));

      const res = await request(app)
        .post("/api/waitlist/promote-manual")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed manual promote" });
    });
  });

  // ======================================================
  // 7) POST /api/waitlist/revoke
  // ======================================================
  describe("POST /api/waitlist/revoke", () => {
    test("404: waitlist entry not found", async () => {
      waitlistModel.getWaitlistEntryById.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/waitlist/revoke")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Waitlist entry not found" });
    });

    test("200: revoke clears promotion", async () => {
      waitlistModel.getWaitlistEntryById.mockResolvedValue({
        waitlist_id: 999,
        event_id: 55,
      });
      waitlistModel.clearPromotion.mockResolvedValue(true);

      const res = await request(app)
        .post("/api/waitlist/revoke")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Promotion revoked." });
      expect(waitlistModel.clearPromotion).toHaveBeenCalledWith(999);
    });

    test("500: revoke failure", async () => {
      waitlistModel.getWaitlistEntryById.mockRejectedValue(new Error("boom"));

      const res = await request(app)
        .post("/api/waitlist/revoke")
        .send({ waitlistId: 999 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to revoke promotion" });
    });
  });

  // ======================================================
  // 8) POST /api/waitlist/clear-expired
  // ======================================================
  describe("POST /api/waitlist/clear-expired", () => {
    test("200: clears expired promotion + attempts to promote next", async () => {
      waitlistModel.removeWaitlistEntry.mockResolvedValue(true);
      waitlistModel.clearExpiredPromotionsForEvent.mockResolvedValue(true);

      // offerNextPromotion: event capacity + signup count => early return
      const qEventCap = makeSupabaseQueryMock({ data: { capacity: 0 }, error: null });
      const qCount = makeSupabaseQueryMock({ data: null, error: null, count: 0 });

      mockSupabaseFrom
        .mockImplementationOnce(() => qEventCap)
        .mockImplementationOnce(() => qCount);

      const res = await request(app)
        .post("/api/waitlist/clear-expired")
        .send({ waitlistId: 999, eventId: 55 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: "Expired promotion cleared. Next candidate promoted.",
      });
      expect(waitlistModel.removeWaitlistEntry).toHaveBeenCalledWith(999);
    });

    test("500: clear-expired failure", async () => {
      waitlistModel.removeWaitlistEntry.mockRejectedValue(new Error("boom"));

      const res = await request(app)
        .post("/api/waitlist/clear-expired")
        .send({ waitlistId: 999, eventId: 55 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Failed to clear expired promotion" });
    });
  });
});
