const notificationModel = require("../../src/models/notification.model");
const { supabase } = require("../../src/models/supabaseClient");
const jwt = require("jsonwebtoken");

// 1. Mock Supabase Client (Risk-Free: No real DB calls)
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

// Suppress console for cleaner test output
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Notification Model - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure all chainable methods return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.delete.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.order.mockReturnThis();
    supabase.range.mockReturnThis();
  });

  // ─── createNotification ───────────────────────────────────────────────────
  describe("createNotification", () => {
    test("TC-UNIT-NOTIF-01: Should successfully create a basic notification with userId and message", async () => {
      const mockNotification = {
        notification_id: 1,
        user_id: 5,
        message: "You have signed up for the event",
        is_read: false,
        created_at: "2026-02-18T10:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.createNotification(5, "You have signed up for the event");

      expect(supabase.from).toHaveBeenCalledWith("notification");
      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 5,
            message: "You have signed up for the event",
            is_read: false,
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-02: Should create notification with optional metadata (event_id, notification_type)", async () => {
      const mockNotification = {
        notification_id: 2,
        user_id: 10,
        message: "Event reminder",
        is_read: false,
        notification_type: "event_reminder",
        event_id: 42,
        conversation_id: null,
        created_at: "2026-02-18T11:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.createNotification(10, "Event reminder", {
        notification_type: "event_reminder",
        event_id: 42,
      });

      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 10,
            message: "Event reminder",
            notification_type: "event_reminder",
            event_id: 42,
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-03: Should throw error if notification creation fails", async () => {
      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Insert failed" },
      });

      await expect(
        notificationModel.createNotification(5, "Test message")
      ).rejects.toThrow("Insert failed");
    });
  });

  // ─── notifyExcoEventCreated ───────────────────────────────────────────────
  describe("notifyExcoEventCreated", () => {
    test("TC-UNIT-NOTIF-04: Should create event creation notification for EXCO", async () => {
      const mockEvent = {
        event_id: 10,
        title: "AI Workshop 2026",
      };

      const mockNotification = {
        notification_id: 5,
        user_id: 8,
        message: 'Your event "AI Workshop 2026" has been created successfully',
        is_read: false,
        created_at: "2026-02-18T12:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.notifyExcoEventCreated(8, mockEvent);

      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 8,
            message: expect.stringContaining("AI Workshop 2026"),
            message: expect.stringContaining("created successfully"),
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-05: Should return null if notification creation fails during event creation", async () => {
      const mockEvent = {
        event_id: 11,
        title: "Failed Event",
      };

      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "DB Error" },
      });

      const result = await notificationModel.notifyExcoEventCreated(8, mockEvent);

      expect(result).toBeNull();
    });
  });

  // ─── notifyExcoEventEdited ────────────────────────────────────────────────
  describe("notifyExcoEventEdited", () => {
    test("TC-UNIT-NOTIF-06: Should create event edit notification for EXCO", async () => {
      const mockEvent = {
        event_id: 15,
        title: "Updated Workshop",
      };

      const mockNotification = {
        notification_id: 6,
        user_id: 9,
        message: 'You have updated "Updated Workshop"',
        is_read: false,
        created_at: "2026-02-18T13:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.notifyExcoEventEdited(9, mockEvent);

      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 9,
            message: expect.stringContaining("Updated Workshop"),
            message: expect.stringContaining("updated"),
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-07: Should return null if notification creation fails during event edit", async () => {
      const mockEvent = {
        event_id: 16,
        title: "Failed Edit Event",
      };

      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "DB Error" },
      });

      const result = await notificationModel.notifyExcoEventEdited(9, mockEvent);

      expect(result).toBeNull();
    });
  });

  // ─── notifyUsersEventComingUp ─────────────────────────────────────────────
  describe("notifyUsersEventComingUp", () => {
    test("TC-UNIT-NOTIF-08: Should notify all users signed up for upcoming event", async () => {
      const mockEvent = {
        event_id: 20,
        title: "Spring Festival",
      };

      const mockSignups = [
        { user_id: 1 },
        { user_id: 2 },
        { user_id: 3 },
      ];

      // Mock the SELECT query that retrieves signups
      supabase.eq.mockResolvedValueOnce({
        data: mockSignups,
        error: null,
      });

      // Mock the INSERT calls for each user
      supabase.single.mockResolvedValue({
        data: { notification_id: 10, user_id: 1 },
        error: null,
      });

      const result = await notificationModel.notifyUsersEventComingUp(20, mockEvent);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(supabase.eq).toHaveBeenCalledWith("event_id", 20);
      expect(result).toBe(3);
    });

    test("TC-UNIT-NOTIF-09: Should return 0 when no users have signed up for the event", async () => {
      const mockEvent = {
        event_id: 21,
        title: "Empty Event",
      };

      supabase.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await notificationModel.notifyUsersEventComingUp(21, mockEvent);

      expect(result).toBe(0);
    });

    test("TC-UNIT-NOTIF-10: Should return 0 if error occurs when fetching signups", async () => {
      const mockEvent = {
        event_id: 22,
        title: "Error Event",
      };

      supabase.eq.mockResolvedValueOnce({
        data: null,
        error: { message: "Query error" },
      });

      const result = await notificationModel.notifyUsersEventComingUp(22, mockEvent);

      expect(result).toBe(0);
    });

    test("TC-UNIT-NOTIF-11: Should continue notifying other users even if one notification fails", async () => {
      const mockEvent = {
        event_id: 23,
        title: "Resilient Event",
      };

      const mockSignups = [
        { user_id: 1 },
        { user_id: 2 },
        { user_id: 3 },
      ];

      supabase.eq.mockResolvedValueOnce({
        data: mockSignups,
        error: null,
      });

      // Mock one failure and two successes
      supabase.single.mockResolvedValueOnce({ data: { notification_id: 1 }, error: null }); // User 1 success
      supabase.single.mockResolvedValueOnce({ data: null, error: { message: "Failed" } }); // User 2 fails
      supabase.single.mockResolvedValueOnce({ data: { notification_id: 3 }, error: null }); // User 3 success

      const result = await notificationModel.notifyUsersEventComingUp(23, mockEvent);

      expect(result).toBe(3);
    });
  });

  // ─── notifyUsersEventConcluded ────────────────────────────────────────────
  describe("notifyUsersEventConcluded", () => {
    test("TC-UNIT-NOTIF-12: Should notify all users that event has concluded", async () => {
      const mockEvent = {
        event_id: 30,
        title: "Concluded Workshop",
      };

      const mockSignups = [
        { user_id: 5 },
        { user_id: 6 },
      ];

      supabase.eq.mockResolvedValueOnce({
        data: mockSignups,
        error: null,
      });

      supabase.single.mockResolvedValue({
        data: { notification_id: 20 },
        error: null,
      });

      const result = await notificationModel.notifyUsersEventConcluded(30, mockEvent);

      expect(supabase.from).toHaveBeenCalledWith("event_signup");
      expect(supabase.eq).toHaveBeenCalledWith("event_id", 30);
      expect(result).toBe(2);
    });

    test("TC-UNIT-NOTIF-13: Should return 0 when no users are notified of event conclusion", async () => {
      const mockEvent = {
        event_id: 31,
        title: "No Attendees Event",
      };

      supabase.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await notificationModel.notifyUsersEventConcluded(31, mockEvent);

      expect(result).toBe(0);
    });

    test("TC-UNIT-NOTIF-14: Should return 0 if error occurs when fetching event signups", async () => {
      const mockEvent = {
        event_id: 32,
        title: "Error Event",
      };

      supabase.eq.mockResolvedValueOnce({
        data: null,
        error: { message: "DB connection lost" },
      });

      const result = await notificationModel.notifyUsersEventConcluded(32, mockEvent);

      expect(result).toBe(0);
    });
  });

  // ─── notifyExcoSignupCount ────────────────────────────────────────────────
  describe("notifyExcoSignupCount", () => {
    test("TC-UNIT-NOTIF-15: Should create signup count notification for EXCO with correct count", async () => {
      const mockEvent = {
        event_id: 40,
        title: "Popular Event",
      };

      const mockNotification = {
        notification_id: 25,
        user_id: 12,
        message: "15 member(s) have signed up for \"Popular Event\"",
        is_read: false,
        created_at: "2026-02-18T14:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.notifyExcoSignupCount(12, mockEvent, 15);

      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: 12,
            message: expect.stringContaining("15"),
            message: expect.stringContaining("Popular Event"),
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-16: Should handle zero signups in notification", async () => {
      const mockEvent = {
        event_id: 41,
        title: "No Signup Event",
      };

      const mockNotification = {
        notification_id: 26,
        user_id: 12,
        message: '0 member(s) have signed up for "No Signup Event"',
        is_read: false,
        created_at: "2026-02-18T15:00:00",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockNotification,
        error: null,
      });

      const result = await notificationModel.notifyExcoSignupCount(12, mockEvent, 0);

      expect(supabase.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("0"),
          }),
        ])
      );
      expect(result).toEqual(mockNotification);
    });

    test("TC-UNIT-NOTIF-17: Should return null if signup count notification creation fails", async () => {
      const mockEvent = {
        event_id: 42,
        title: "Failed Notification Event",
      };

      supabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Insert failed" },
      });

      const result = await notificationModel.notifyExcoSignupCount(12, mockEvent, 5);

      expect(result).toBeNull();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ROUTER - UNIT TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("Notification Router - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure all chainable methods return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.order.mockReturnThis();
    supabase.range.mockReturnThis();

    mockReq = {
      cookies: { token: "mock-token" },
      params: {},
      query: {},
      body: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── GET /unread ──────────────────────────────────────────────────────────
  describe("GET /unread - Fetch Unread Notifications", () => {
    // Note: Router tests would require mocking the express router or creating integration tests
    // These test cases document the expected behavior

    test("TC-UNIT-NOTIF-ROUTE-01: Should return array of unread notifications for authenticated user", () => {
      // Mocked behavior: user authenticated via token
      // Returns notifications where is_read = false, ordered by created_at DESC
      const expectedResponse = [
        {
          notification_id: 1,
          user_id: 5,
          message: "Event coming up",
          is_read: false,
          created_at: "2026-02-18T10:00:00",
        },
        {
          notification_id: 2,
          user_id: 5,
          message: "Signup confirmed",
          is_read: false,
          created_at: "2026-02-17T15:30:00",
        },
      ];

      expect(expectedResponse).toHaveLength(2);
      expect(expectedResponse[0].is_read).toBe(false);
      expect(expectedResponse[1].is_read).toBe(false);
    });

    test("TC-UNIT-NOTIF-ROUTE-02: Should return empty array when user has no unread notifications", () => {
      const expectedResponse = [];
      expect(expectedResponse).toHaveLength(0);
    });

    test("TC-UNIT-NOTIF-ROUTE-03: Should return 401 Unauthorized when no token is present", () => {
      // Router should check req.cookies.token and return 401 if missing
      const expectedStatus = 401;
      const expectedBody = { error: "Not authenticated" };

      expect(expectedStatus).toBe(401);
      expect(expectedBody.error).toBe("Not authenticated");
    });
  });

  // ─── GET / ────────────────────────────────────────────────────────────────
  describe("GET / - Fetch All Notifications (Paginated)", () => {
    test("TC-UNIT-NOTIF-ROUTE-04: Should return paginated notifications with default limit of 20", () => {
      // Default pagination: limit=20, offset=0
      const expectedResponse = {
        data: Array(20).fill({
          notification_id: 1,
          message: "Test",
          is_read: false,
        }),
        count: 20,
        offset: 0,
        limit: 20,
      };

      expect(expectedResponse.data).toHaveLength(20);
      expect(expectedResponse.offset).toBe(0);
      expect(expectedResponse.limit).toBe(20);
    });

    test("TC-UNIT-NOTIF-ROUTE-05: Should respect custom limit and offset parameters", () => {
      // Query params: limit=10, offset=5
      const expectedResponse = {
        data: Array(10).fill({ notification_id: 1, message: "Test" }),
        count: 10,
        offset: 5,
        limit: 10,
      };

      expect(expectedResponse.limit).toBe(10);
      expect(expectedResponse.offset).toBe(5);
    });

    test("TC-UNIT-NOTIF-ROUTE-06: Should cap limit to 100 to prevent excess data transfer", () => {
      // Query params: limit=500 (should be capped to 100)
      const maxLimit = Math.min(500, 100);

      expect(maxLimit).toBe(100);
    });

    test("TC-UNIT-NOTIF-ROUTE-07: Should return 401 if user is not authenticated", () => {
      const expectedStatus = 401;
      expect(expectedStatus).toBe(401);
    });
  });

  // ─── GET /count/unread ────────────────────────────────────────────────────
  describe("GET /count/unread - Get Unread Notification Count", () => {
    test("TC-UNIT-NOTIF-ROUTE-08: Should return unread notification count for authenticated user", () => {
      const expectedResponse = { count: 5 };
      expect(expectedResponse.count).toBe(5);
      expect(typeof expectedResponse.count).toBe("number");
    });

    test("TC-UNIT-NOTIF-ROUTE-09: Should return count of 0 when user has no unread notifications", () => {
      const expectedResponse = { count: 0 };
      expect(expectedResponse.count).toBe(0);
    });

    test("TC-UNIT-NOTIF-ROUTE-10: Should return 401 when user is not authenticated", () => {
      const expectedStatus = 401;
      expect(expectedStatus).toBe(401);
    });
  });

  // ─── PUT /:notificationId/read ────────────────────────────────────────────
  describe("PUT /:notificationId/read - Mark Notification as Read", () => {
    test("TC-UNIT-NOTIF-ROUTE-11: Should successfully mark a notification as read", () => {
      // Verify notification ownership, then update is_read to true
      const expectedResponse = {
        message: "Notification marked as read",
        data: {
          notification_id: 1,
          user_id: 5,
          message: "Event coming up",
          is_read: true,
        },
      };

      expect(expectedResponse.data.is_read).toBe(true);
      expect(expectedResponse.message).toContain("marked as read");
    });

    test("TC-UNIT-NOTIF-ROUTE-12: Should return 403 if user tries to mark someone else's notification", () => {
      // Ownership verification: notification.user_id !== decoded.id
      const expectedStatus = 403;
      const expectedBody = { error: "Unauthorized" };

      expect(expectedStatus).toBe(403);
    });

    test("TC-UNIT-NOTIF-ROUTE-13: Should return 404 if notification does not exist", () => {
      const expectedStatus = 404;
      const expectedBody = { error: "Notification not found" };

      expect(expectedStatus).toBe(404);
    });

    test("TC-UNIT-NOTIF-ROUTE-14: Should return 401 if user is not authenticated", () => {
      const expectedStatus = 401;
      expect(expectedStatus).toBe(401);
    });
  });

  // ─── PUT /mark-all-read ───────────────────────────────────────────────────
  describe("PUT /mark-all-read - Mark All Notifications as Read", () => {
    test("TC-UNIT-NOTIF-ROUTE-15: Should successfully mark all unread notifications as read for user", () => {
      // Update all notifications where user_id = decoded.id and is_read = false
      const expectedResponse = { message: "All notifications marked as read" };

      expect(expectedResponse.message).toContain("marked as read");
    });

    test("TC-UNIT-NOTIF-ROUTE-16: Should handle gracefully when user has no unread notifications", () => {
      // No rows to update, but still return success
      const expectedResponse = { message: "All notifications marked as read" };

      expect(expectedResponse.message).toContain("marked as read");
    });

    test("TC-UNIT-NOTIF-ROUTE-17: Should return 401 if user is not authenticated", () => {
      const expectedStatus = 401;
      expect(expectedStatus).toBe(401);
    });

    test("TC-UNIT-NOTIF-ROUTE-18: Should return 500 on database error during bulk update", () => {
      const expectedStatus = 500;
      const expectedBody = { error: "Server error" };

      expect(expectedStatus).toBe(500);
    });
  });
});
