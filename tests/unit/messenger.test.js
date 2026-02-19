const request = require("supertest");

// ✅ jwt.verify mocked (controller + middleware both use it)
jest.mock("jsonwebtoken", () => ({ verify: jest.fn() }));

// ✅ supabase.from mocked (model + controller use it)
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));

// ✅ prevent real notification side-effects
jest.mock("../../src/models/notification.model", () => ({
  createNotification: jest.fn(() => Promise.resolve(true)),
}));

const app = require("../../src/app");
const jwt = require("jsonwebtoken");
const { supabase } = require("../../src/models/supabaseClient");
const { createNotification } = require("../../src/models/notification.model");

/**
 * ✅ Chainable Supabase query mock that supports:
 * select/eq/in/or/is/neq/gt/gte/lt/ilike/order/limit/insert/update/delete/upsert/single/maybeSingle
 * and also supports awaiting directly (via .then)
 */
function makeQueryMock(finalResolvedValue) {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    in: jest.fn(() => q),
    or: jest.fn(() => q),
    is: jest.fn(() => q),
    neq: jest.fn(() => q),
    gt: jest.fn(() => q),
    gte: jest.fn(() => q),
    lt: jest.fn(() => q),
    ilike: jest.fn(() => q),
    order: jest.fn(() => q),
    limit: jest.fn(() => q),
    insert: jest.fn(() => q),
    update: jest.fn(() => q),
    delete: jest.fn(() => q),
    upsert: jest.fn(() => q),
    single: jest.fn(async () => finalResolvedValue),
    maybeSingle: jest.fn(async () => finalResolvedValue),
    then: (resolve, reject) =>
      Promise.resolve(finalResolvedValue).then(resolve, reject),
  };
  return q;
}

/**
 * ✅ Supports multiple calls to same table in one request.
 * tableMap = { tableName: [resp1, resp2, ...] } OR { tableName: resp }
 */
function mockSupabaseFrom(tableMap) {
  const counters = new Map();

  supabase.from.mockImplementation((table) => {
    if (!(table in tableMap)) {
      throw new Error(`Unmocked supabase.from("${table}")`);
    }

    const v = tableMap[table];
    const idx = counters.get(table) || 0;
    counters.set(table, idx + 1);

    const resolved = Array.isArray(v) ? v[idx] : v;

    if (!resolved) {
      throw new Error(
        `No queued response left for supabase.from("${table}") call #${idx + 1}`,
      );
    }

    return makeQueryMock(resolved);
  });
}

function authAs(userId) {
  jwt.verify.mockReturnValue({ id: userId });
  return `token=fake.jwt.token`;
}

describe("Messenger API — Jest unit tests (controller-level, mocked Supabase)", () => {
  const BASE = "/api/messenger";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================
  // Auth enforcement (cookie token)
  // =========================
  describe("Auth enforcement", () => {
    test("401 when no cookie token", async () => {
      const res = await request(app).get(`${BASE}/conversations`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    test("401 when jwt.verify throws", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("bad token");
      });

      const res = await request(app)
        .get(`${BASE}/conversations`)
        .set("Cookie", `token=bad`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
  });

  // =========================
  // GET /conversations
  // =========================
  describe("GET /conversations (listConversations)", () => {
    test("200 returns empty conversations array", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // memberships for auto-join
        cca_membership: { data: [], error: null },
        // listUserConversations
        conversation_member: { data: [], error: null },
      });

      const res = await request(app)
        .get(`${BASE}/conversations`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ conversations: [] });
    });

    test("200 decorates DM title from other user's name + includes unread + last_message", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // auto-join memberships
        cca_membership: { data: [], error: null },

        // listUserConversations returns "conversation_member + embedded conversation"
        conversation_member: {
          data: [
            {
              conversation_id: 1,
              role_in_convo: "member",
              last_read_at: null,
              conversation: {
                conversation_id: 1,
                type: "DM",
                cca_id: null,
                event_id: null,
                title: null,
                dm_key: "10:99",
                created_at: "2026-02-18T00:00:00.000Z",
              },
            },
          ],
          error: null,
        },

        // unread count query
        message: [
          // countUnread uses select(head:true,count) and reads {count}
          { data: null, error: null, count: 3 },
          // getLatestMessagePreview
          {
            data: [
              {
                message_id: 500,
                content: "hello",
                created_at: "2026-02-18T09:00:00.000Z",
                is_system: false,
                sender_id: 99,
              },
            ],
            error: null,
          },
        ],

        // getDmOtherUser -> getUserProfileBasic(otherId) hits User
        User: {
          data: {
            user_id: 99,
            name: "Teacher Bob",
            email: "bob@sp.edu.sg",
            user_type: "teacher",
          },
          error: null,
        },
      });

      const res = await request(app)
        .get(`${BASE}/conversations`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toHaveLength(1);

      const c = res.body.conversations[0];
      expect(c).toEqual(
        expect.objectContaining({
          conversation_id: 1,
          type: "DM",
          title: "Teacher Bob",
          unread: 3,
          last_message: expect.objectContaining({
            content: "hello",
            sender_id: 99,
          }),
        }),
      );
    });

    test("500 when conversation_member query fails", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        cca_membership: { data: [], error: null },
        conversation_member: { data: null, error: { message: "DB down" } },
      });

      const res = await request(app)
        .get(`${BASE}/conversations`)
        .set("Cookie", cookie);

      expect(res.status).toBe(500);
      expect(res.body).toEqual(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
  });

  // =========================
  // GET /conversations/:id/messages
  // =========================
  describe("GET /conversations/:conversation_id/messages (getMessages)", () => {
    test("403 when user not a member", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        conversation_member: { data: null, error: null }, // membership check maybeSingle -> null
      });

      const res = await request(app)
        .get(`${BASE}/conversations/55/messages?limit=30`)
        .set("Cookie", cookie);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    test("200 returns messages in ascending order (model reverses)", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // membership check
        conversation_member: { data: { user_id: 10 }, error: null },

        // message list query (model orders desc then reverses)
        message: {
          data: [
            { message_id: 2, created_at: "2026-02-18T10:01:00.000Z" },
            { message_id: 1, created_at: "2026-02-18T10:00:00.000Z" },
          ],
          error: null,
        },
      });

      const res = await request(app)
        .get(`${BASE}/conversations/55/messages?limit=30`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.messages.map((m) => m.message_id)).toEqual([1, 2]);
    });

    test("500 when message query fails", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        conversation_member: { data: { user_id: 10 }, error: null },
        message: { data: null, error: { message: "DB down" } },
      });

      const res = await request(app)
        .get(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie);

      expect(res.status).toBe(500);
    });
  });

  // =========================
  // POST /conversations/:id/messages (sendMessage + requireNotSuspended)
  // =========================
  describe("POST /conversations/:conversation_id/messages (sendMessage + suspension guard)", () => {
    test("403 blocked by requireNotSuspended when active suspension exists", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // middleware checks active suspension
        user_suspension: {
          data: {
            suspension_id: 1,
            user_id: 10,
            end_at: "2099-01-01T00:00:00.000Z",
            is_active: true,
            lifted_at: null,
          },
          error: null,
        },
      });

      const res = await request(app)
        .post(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie)
        .send({ content: "hi" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Suspended until/i);
    });

    test("400 when content empty", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // middleware suspension check: none
        user_suspension: { data: null, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie)
        .send({ content: "   " });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be empty/i);
    });

    test("403 when not member", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        user_suspension: { data: null, error: null },
        conversation_member: { data: null, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie)
        .send({ content: "hello" });

      expect(res.status).toBe(403);
    });

    test("201 success inserts message + creates notifications for other members", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // middleware suspension check
        user_suspension: { data: null, error: null },

        // membership check
        conversation_member: { data: { user_id: 10 }, error: null },

        // insert message
        message: {
          data: {
            message_id: 999,
            conversation_id: 55,
            sender_id: 10,
            content: "hello",
          },
          error: null,
        },

        // controller directly fetches convo meta
        conversation: {
          data: { type: "CCA_GROUP", cca_id: 1, title: "SP Chess Chat" },
          error: null,
        },

        // members list
        conversation_member__members: null,
        // NOTE: getConversationMembers uses conversation_member again, so queue it:
        conversation_member: [
          { data: { user_id: 10 }, error: null }, // membership check
          {
            data: [
              { user_id: 10 },
              { user_id: 20 },
              { user_id: 30 },
            ],
            error: null,
          },
        ],

        // sender profile
        User: {
          data: { user_id: 10, name: "Me", email: "me@x.com", user_type: "student" },
          error: null,
        },
      });

      const res = await request(app)
        .post(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie)
        .send({ content: "hello" });

      expect(res.status).toBe(201);
      expect(res.body.message).toEqual(
        expect.objectContaining({ message_id: 999, content: "hello" }),
      );

      // 2 other members should be notified
      expect(createNotification).toHaveBeenCalledTimes(2);
    });

    test("500 when convo meta lookup fails after insert", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        user_suspension: { data: null, error: null },
        conversation_member: { data: { user_id: 10 }, error: null },
        message: {
          data: { message_id: 1, conversation_id: 55, sender_id: 10, content: "ok" },
          error: null,
        },
        conversation: { data: null, error: { message: "DB down" } },
      });

      const res = await request(app)
        .post(`${BASE}/conversations/55/messages`)
        .set("Cookie", cookie)
        .send({ content: "ok" });

      expect(res.status).toBe(500);
    });
  });

  // =========================
  // POST /messages/:id/pin + DELETE /conversations/:id/pin
  // =========================
  describe("Pin / Unpin (staff in CCA only)", () => {
    test("400 pin rejected if conversation is not CCA_GROUP", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // getMessageById
        message: {
          data: { message_id: 5, conversation_id: 88, sender_id: 20, deleted_at: null },
          error: null,
        },
        // must be member
        conversation_member: { data: { user_id: 10 }, error: null },
        // convo type check
        conversation: { data: { type: "DM", cca_id: null }, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/messages/5/pin`)
        .set("Cookie", cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only for CCA group/i);
    });

    test("403 pin rejected if not exco/teacher in that CCA", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        message: {
          data: { message_id: 5, conversation_id: 88, sender_id: 20, deleted_at: null },
          error: null,
        },
        conversation_member: { data: { user_id: 10 }, error: null },
        conversation: { data: { type: "CCA_GROUP", cca_id: 7 }, error: null },
        cca_membership: { data: { membership_id: 1, role: "member" }, error: null }, // userHasCcaAccess
      });

      const res = await request(app)
        .post(`${BASE}/messages/5/pin`)
        .set("Cookie", cookie)
        .send({});

      expect(res.status).toBe(403);
    });

    test("200 pin success upserts pinned_message", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        message: {
          data: { message_id: 5, conversation_id: 88, sender_id: 20, deleted_at: null },
          error: null,
        },
        conversation_member: { data: { user_id: 10 }, error: null },
        conversation: { data: { type: "CCA_GROUP", cca_id: 7 }, error: null },
        cca_membership: { data: { membership_id: 1, role: "teacher" }, error: null },
        pinned_message: {
          data: { conversation_id: 88, message_id: 5, pinned_by: 10 },
          error: null,
        },
      });

      const res = await request(app)
        .post(`${BASE}/messages/5/pin`)
        .set("Cookie", cookie)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: "ok",
          pinned: expect.objectContaining({ message_id: 5 }),
        }),
      );
    });

    test("200 unpin success deletes pinned_message (staff only)", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // must be member
        conversation_member: { data: { user_id: 10 }, error: null },
        // convo type check
        conversation: { data: { type: "CCA_GROUP", cca_id: 7 }, error: null },
        // staff check
        cca_membership: { data: { membership_id: 1, role: "exco" }, error: null },
        // delete
        pinned_message: { data: null, error: null },
      });

      const res = await request(app)
        .delete(`${BASE}/conversations/88/pin`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ status: "ok", unpinned: { conversation_id: 88 } }),
      );
    });
  });

  // =========================
  // POST /messages/:id/report (creates report + moderation case)
  // =========================
  describe("Report message workflow", () => {
    test("201 report creates moderation_case for CCA scope + notifies staff", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // getMessageById
        message: [
          { data: { message_id: 9, conversation_id: 77, sender_id: 99 }, error: null },
          // controller re-queries message table to get sender_id via select().single()
          { data: { sender_id: 99 }, error: null },
        ],
        // membership check
        conversation_member: { data: { user_id: 10 }, error: null },
        // report insert
        message_report: { data: { report_id: 1 }, error: null },
        // convo meta
        conversation: { data: { type: "CCA_GROUP", cca_id: 3, title: "CCA Chat" }, error: null },
        // reporter profile
        User: { data: { user_id: 10, name: "Reporter", user_type: "student" }, error: null },
        // create moderation case
        moderation_case: { data: { case_id: 5 }, error: null },
        // staff list for notifications
        cca_membership: {
          data: [
            { user_id: 20, role: "teacher" },
            { user_id: 30, role: "exco" },
          ],
          error: null,
        },
      });

      const res = await request(app)
        .post(`${BASE}/messages/9/report`)
        .set("Cookie", cookie)
        .send({ reason: "spam" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: "ok",
          report: expect.objectContaining({ report_id: 1 }),
          case: expect.objectContaining({ case_id: 5 }),
        }),
      );

      // notified 2 staff (reporter is user 10, not in staff list here)
      expect(createNotification).toHaveBeenCalledTimes(2);
    });

    test("403 report rejected if reporter is not member of convo", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        message: { data: { message_id: 9, conversation_id: 77, sender_id: 99 }, error: null },
        conversation_member: { data: null, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/messages/9/report`)
        .set("Cookie", cookie)
        .send({ reason: "spam" });

      expect(res.status).toBe(403);
    });
  });

  // =========================
  // GET /suspension/me
  // =========================
  describe("GET /suspension/me", () => {
    test("200 returns suspended=false when no active suspension", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        user_suspension: { data: null, error: null },
      });

      const res = await request(app)
        .get(`${BASE}/suspension/me`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ suspended: false, suspension: null });
    });

    test("200 returns normalized suspension payload when active", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        user_suspension: {
          data: {
            suspension_id: 1,
            user_id: 10,
            start_at: "2026-02-18T00:00:00.000Z",
            end_at: "2026-02-20T00:00:00.000Z",
            reason: "bad",
            created_by: 99,
          },
          error: null,
        },
      });

      const res = await request(app)
        .get(`${BASE}/suspension/me`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.suspended).toBe(true);
      expect(res.body.suspension).toEqual(
        expect.objectContaining({
          suspension_id: 1,
          user_id: 10,
          end_at: "2026-02-20T00:00:00.000Z",
        }),
      );
    });
  });

  // =========================
  // POST /moderation/cases/:id/action (unsuspend path = your bugfix)
  // =========================
  describe("Moderation action: UNSUSPEND (lift suspension) — regression-grade", () => {
    test("403 if non-staff tries moderation action", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        User: { data: { user_id: 10, user_type: "student", name: "S" }, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/moderation/cases/5/action`)
        .set("Cookie", cookie)
        .send({ action: "unsuspend", note: "test" });

      expect(res.status).toBe(403);
    });

    test("403 if staff is EXCO but not global moderator (teacher) for unsuspend", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // meProfile (staff check)
        User: { data: { user_id: 10, user_type: "exco", name: "Exco" }, error: null },

        // controller reads moderation_case directly
        moderation_case: {
          data: {
            case_id: 5,
            scope: "CCA",
            cca_id: 7,
            conversation_id: 88,
            message_id: 9,
            reported_user_id: 123,
            status: "SUSPENDED",
          },
          error: null,
        },

        // CCA access check (passes)
        cca_membership: { data: { membership_id: 1, role: "exco" }, error: null },
      });

      const res = await request(app)
        .post(`${BASE}/moderation/cases/5/action`)
        .set("Cookie", cookie)
        .send({ action: "unsuspend", note: "please lift" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only teachers/i);
    });

    test("200 teacher unsuspends: lifts suspension + resolves case to LIFTED + notifies offender", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        // meProfile staff check
        User: { data: { user_id: 10, user_type: "teacher", name: "T" }, error: null },

        // moderation_case load
        moderation_case: [
          {
            data: {
              case_id: 5,
              scope: "CCA",
              cca_id: 7,
              conversation_id: 88,
              message_id: 9,
              reported_user_id: 123,
              status: "SUSPENDED",
            },
            error: null,
          },
          // resolveModerationCase update
          { data: { case_id: 5, status: "LIFTED" }, error: null },
        ],

        // CCA access check teacher/exco membership (passes)
        cca_membership: { data: { membership_id: 1, role: "teacher" }, error: null },

        // isGlobalModerator -> getUserProfileBasic again (User) (teacher)
        // already mocked above, single() reused is ok for this test because model calls User again:
        // If your mock runner complains about multiple calls, swap User to array.

        // liftSuspension flow:
        // find actives
        user_suspension: [
          { data: [{ suspension_id: 1 }], error: null },
          // bulk update with in(...)
          {
            data: [
              {
                suspension_id: 1,
                user_id: 123,
                is_active: false,
                lifted_at: "2026-02-18T00:00:00.000Z",
                lifted_by: 10,
                lifted_reason: "ok",
              },
            ],
            error: null,
          },
        ],
      });

      const res = await request(app)
        .post(`${BASE}/moderation/cases/5/action`)
        .set("Cookie", cookie)
        .send({ action: "unsuspend", note: "ok" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: "ok",
          case: expect.objectContaining({ status: "LIFTED" }),
          suspension: expect.objectContaining({ lifted: true }),
        }),
      );

      // offender notified
      expect(createNotification).toHaveBeenCalledWith(
        123,
        expect.stringMatching(/suspension has been lifted/i),
        expect.any(Object),
      );
    });

    test("200 teacher unsuspend returns lifted=false if no active suspension", async () => {
      const cookie = authAs(10);

      mockSupabaseFrom({
        User: { data: { user_id: 10, user_type: "teacher", name: "T" }, error: null },

        moderation_case: {
          data: {
            case_id: 5,
            scope: "DM",
            cca_id: null,
            conversation_id: 88,
            message_id: 9,
            reported_user_id: 123,
            status: "OPEN",
          },
          error: null,
        },

        // DM scope requires isGlobalModerator (teacher => ok)
        // liftSuspension find actives = []
        user_suspension: { data: [], error: null },
      });

      const res = await request(app)
        .post(`${BASE}/moderation/cases/5/action`)
        .set("Cookie", cookie)
        .send({ action: "unsuspend", note: "try" });

      expect(res.status).toBe(200);
      expect(res.body.suspension).toEqual(
        expect.objectContaining({
          lifted: false,
          reason: expect.stringMatching(/no active suspension/i),
        }),
      );
    });
  });
});
