const eventController = require("../../src/controllers/event.controller");
const notificationModel = require("../../src/models/notification.model");
const { supabase } = require("../../src/models/supabaseClient");
const jwt = require("jsonwebtoken");

// 1. Mock Supabase and Notifications
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

jest.mock("../../src/models/notification.model", () => ({
  createNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("jsonwebtoken");

describe("Teacher Approval Workflow - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Ensure all chainable methods return 'this' by default
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.in.mockReturnThis();
    supabase.order.mockReturnThis();

    mockReq = { cookies: { token: "mock-token" }, params: {}, body: {} };
    mockRes = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn().mockReturnThis() 
    };
  });

  describe("getPendingEvents (Teacher Access Control)", () => {
    test("TC-UNIT-APP-03: Should only return events for CCAs managed by the teacher", async () => {
      jwt.verify.mockReturnValue({ id: 10, role: "teacher" });
      
      /**
       * FIX: The controller calls .eq() twice for memberships. 
       * 1st .eq("user_id", ...) returns 'this'
       * 2nd .eq("role", "teacher") returns the actual data
       */
      supabase.eq
        .mockReturnValueOnce(supabase) // First .eq()
        .mockResolvedValueOnce({ data: [{ cca_id: 1 }, { cca_id: 2 }], error: null }); // Second .eq()
      
      // Mock the second DB call (the actual events)
      const mockEvents = [{ event_id: 1, title: "CCA 1 Event" }];
      supabase.order.mockResolvedValueOnce({ data: mockEvents, error: null });

      await eventController.getPendingEvents(mockReq, mockRes);

      // Verify filters
      expect(supabase.in).toHaveBeenCalledWith("cca_id", [1, 2]);
      expect(supabase.eq).toHaveBeenCalledWith("status", "pending");
      expect(mockRes.json).toHaveBeenCalledWith(mockEvents);
    });

    test("TC-UNIT-APP-04: Should return 401 if user is not authenticated", async () => {
      jwt.verify.mockImplementation(() => { throw new Error("Invalid Token"); });
      await eventController.getPendingEvents(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe("reviewEvent (Approval Logic)", () => {
    test("TC-UNIT-APP-01: Should successfully approve an event and notify EXCO", async () => {
      jwt.verify.mockReturnValue({ id: 10, role: "teacher" });
      mockReq.params.eventId = "101";
      mockReq.body.status = "approved";

      const mockEvent = { event_id: 101, title: "Art Expo", created_by: 5 };
      supabase.single.mockResolvedValueOnce({ data: mockEvent, error: null });

      await eventController.reviewEvent(mockReq, mockRes);

      expect(supabase.update).toHaveBeenCalledWith({ status: "approved" });
      expect(notificationModel.createNotification).toHaveBeenCalledWith(
        5, 
        expect.stringContaining('APPROVED')
      );
    });
  });
});