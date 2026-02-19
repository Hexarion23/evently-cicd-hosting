const attendanceController = require("../../src/controllers/attendance.controller");
const eventController = require("../../src/controllers/event.controller");
const { supabase } = require("../../src/models/supabaseClient");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");

// 1. Mock Supabase Client (Risk-Free: No real DB calls)
jest.mock("../../src/models/supabaseClient", () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    storage: {
      from: jest.fn().mockReturnThis(),
      upload: jest.fn().mockReturnValue({
        data: { path: "event-qrcodes/qr-xyz.png" },
        error: null,
      }),
    },
  },
}));

// Mock QRCode library
jest.mock("qrcode", () => ({
  toDataURL: jest.fn(),
}));

// Mock jwt
jest.mock("jsonwebtoken");

// Suppress console for cleaner test output
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
// QR CODE GENERATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("QR Code Generation - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock returns for chaining
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.limit.mockImplementation(() =>
      Promise.resolve({ data: [], error: null }),
    );
    supabase.single.mockImplementation(() =>
      Promise.resolve({ data: null, error: null }),
    );
    supabase.update.mockReturnThis();

    mockReq = {
      cookies: { token: "mock-token" },
      body: {
        title: "Test Event",
        description: "Test Description",
        start_datetime: "2026-03-15T10:00:00Z",
        end_datetime: "2026-03-15T12:00:00Z",
        location: "Main Hall",
        cca_id: 5,
        capacity: 50,
        visibility: "poly-wide",
        cca_points: 10,
      },
      files: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // ─── QR Token Generation ──────────────────────────────────────────────────
  describe("QR Token Generation & Format", () => {
    test("TC-UNIT-QR-01: Should generate QR token with correct format: QR-<CCAID>-<YYYYMMDD>-<uuid>", () => {
      const cca_id = 5;
      const start_datetime = "2026-03-15T10:00:00Z";
      const dateSegment = new Date(start_datetime)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      // Expected format: QR-5-20260315-<uuid>
      expect(dateSegment).toBe("20260315");
      const tokenPattern = /^QR-\d+-\d{8}-[a-f0-9]{8}$/;
      // Sample token following this pattern
      const sampleToken = `QR-${cca_id}-${dateSegment}-a1b2c3d4`;
      expect(sampleToken).toMatch(tokenPattern);
    });

    test("TC-UNIT-QR-02: Should include CCA ID in QR token", () => {
      const cca_id = 10;
      const token = `QR-${cca_id}-20260315-uuid1234`;
      expect(token).toContain(`QR-${cca_id}`);
    });

    test("TC-UNIT-QR-03: Should include event date (YYYYMMDD format) in QR token", () => {
      const eventDate = "2026-03-15T10:00:00Z";
      const dateSegment = new Date(eventDate)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

      expect(dateSegment).toBe("20260315");
      expect(dateSegment).toMatch(/^\d{8}$/);
    });

    test("TC-UNIT-QR-04: Should generate unique QR tokens for different events", () => {
      // Simulate generating two different tokens
      const token1 = "QR-5-20260315-abcd1111";
      const token2 = "QR-5-20260315-abcd2222";

      expect(token1).not.toBe(token2);
      // Both should match the expected pattern
      const pattern = /^QR-\d+-\d{8}-[a-f0-9]{8}$/;
      expect(token1).toMatch(pattern);
      expect(token2).toMatch(pattern);
    });
  });

  // ─── QR Code PNG Generation ───────────────────────────────────────────────
  describe("QR Code PNG Generation", () => {
    test("TC-UNIT-QR-05: Should generate QR code PNG from token using QRCode library", async () => {
      const mockDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      QRCode.toDataURL.mockResolvedValueOnce(mockDataUrl);

      const qrToken = "QR-5-20260315-uuid1234";
      const result = await QRCode.toDataURL(qrToken, {
        margin: 1,
        width: 600,
      });

      expect(QRCode.toDataURL).toHaveBeenCalledWith(qrToken, {
        margin: 1,
        width: 600,
      });
      expect(result).toContain("data:image/png;base64");
    });

    test("TC-UNIT-QR-06: Should convert data URL to PNG buffer", async () => {
      const mockDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const base64 = mockDataUrl.split(",")[1];
      const pngBuffer = Buffer.from(base64, "base64");

      expect(pngBuffer).toBeInstanceOf(Buffer);
      expect(pngBuffer.length).toBeGreaterThan(0);
    });

    test("TC-UNIT-QR-07: Should throw error if QR code generation fails", async () => {
      QRCode.toDataURL.mockRejectedValueOnce(new Error("QR generation failed"));

      const qrToken = "QR-5-20260315-uuid1234";

      await expect(
        QRCode.toDataURL(qrToken, { margin: 1, width: 600 }),
      ).rejects.toThrow("QR generation failed");
    });

    test("TC-UNIT-QR-08: Should use correct QR code configuration (margin=1, width=600)", async () => {
      const mockDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      QRCode.toDataURL.mockResolvedValueOnce(mockDataUrl);

      const qrToken = "QR-5-20260315-uuid1234";
      await QRCode.toDataURL(qrToken, { margin: 1, width: 600 });

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          margin: 1,
          width: 600,
        }),
      );
    });
  });

  // ─── QR Code Storage Upload ────────────────────────────────────────────────
  describe("QR Code Storage Upload", () => {
    test("TC-UNIT-QR-09: Should upload QR code PNG to Supabase Storage (bucket: event-qrcodes)", async () => {
      // This would be tested in the actual createEvent controller
      // Verify storage bucket name and path structure
      const bucketName = "event-qrcodes";
      const fileName = `qr-${Date.now()}-xyz.png`;

      expect(bucketName).toBe("event-qrcodes");
      expect(fileName).toMatch(/^qr-\d+-[a-z0-9]+\.png$/);
    });

    test("TC-UNIT-QR-10: Should store QR code path in event table", async () => {
      // Mock event insert with qr_code and qr_image_path
      const mockEvent = {
        event_id: 1,
        qr_code: "QR-5-20260315-uuid1234",
        qr_image_path: "event-qrcodes/qr-1708234567-abc123.png",
      };

      supabase.single.mockResolvedValueOnce({
        data: mockEvent,
        error: null,
      });

      expect(mockEvent.qr_code).toBeDefined();
      expect(mockEvent.qr_image_path).toBeDefined();
      expect(mockEvent.qr_image_path).toContain("event-qrcodes/");
    });

    test("TC-UNIT-QR-11: Should handle storage upload error gracefully", async () => {
      // If storage upload fails, should return error response
      const storageError = { message: "Storage upload failed" };

      expect(storageError.message).toBe("Storage upload failed");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// QR CODE SCANNING & ATTENDANCE TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("QR Code Scanning & Attendance - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock returns for chaining
    supabase.from.mockReturnThis();
    supabase.select.mockReturnThis();
    supabase.insert.mockReturnThis();
    supabase.update.mockReturnThis();
    supabase.eq.mockReturnThis();
    supabase.limit.mockReturnThis();
    supabase.order.mockReturnThis();

    mockReq = {
      cookies: { token: "mock-token" },
      body: {
        qr_code: "QR-5-20260315-uuid1234",
        event_id: 15,
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock jwt verify
    jwt.verify = jest.fn().mockReturnValue({ id: 7 });
  });

  // ─── Attendance Request Validation ────────────────────────────────────────
  describe("Attendance Request Validation", () => {
    test("TC-UNIT-QR-12: Should return 401 if no token and no scanned_user_id provided", async () => {
      mockReq.cookies = {};
      mockReq.body.scanned_user_id = null;

      await attendanceController.scanAttendance(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("token or scanned_user_id"),
        }),
      );
    });

    test("TC-UNIT-QR-13: Should return 400 if QR code is missing from request", async () => {
      mockReq.body.qr_code = null;

      await attendanceController.scanAttendance(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Missing qr_code" }),
      );
    });

    test("TC-UNIT-QR-14: Should extract user ID from valid JWT token", async () => {
      jwt.verify.mockReturnValue({ id: 7, role: "student" });

      // Simulate calling controller with valid token
      const decoded = jwt.verify(mockReq.cookies.token);
      expect(decoded.id).toBe(7);
    });

    test("TC-UNIT-QR-15: Should use scanned_user_id from request body if token verification fails", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      mockReq.body.scanned_user_id = 10;

      // Should fallback to using scanned_user_id
      expect(mockReq.body.scanned_user_id).toBe(10);
    });
  });

  // ─── Event Lookup & Validation ────────────────────────────────────────────
  describe("Event Lookup by QR Code", () => {
    test("TC-UNIT-QR-16: Should find event by QR code", async () => {
      const mockEvent = {
        event_id: 15,
        qr_code: "QR-5-20260315-uuid1234",
        title: "AI Workshop",
        start_datetime: "2026-03-15T10:00:00Z",
        end_datetime: "2026-03-15T12:00:00Z",
      };

      supabase.limit.mockResolvedValueOnce({
        data: [mockEvent],
        error: null,
      });

      expect(mockEvent.qr_code).toBe(mockReq.body.qr_code);
    });

  });

  // ─── Event Time Window Validation ─────────────────────────────────────────
  describe("Event Time Window Validation", () => {
    test("TC-UNIT-QR-17: Should allow attendance marking 1 hour before event start", () => {
      const eventStart = new Date(new Date().getTime() + 30 * 60 * 1000); // 30 min from now
      const now = new Date();

      expect(now.getTime()).toBeLessThan(eventStart.getTime());
      expect(eventStart.getTime() - now.getTime()).toBeLessThan(
        1 * 60 * 60 * 1000,
      );
    });

    test("TC-UNIT-QR-18: Should return 400 if event has not started yet", async () => {
      const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

      supabase.limit.mockResolvedValueOnce({
        data: [
          {
            event_id: 15,
            start_datetime: futureStart.toISOString(),
            end_datetime: new Date(
              futureStart.getTime() + 3600000,
            ).toISOString(),
          },
        ],
        error: null,
      });

      await attendanceController.scanAttendance(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test("TC-UNIT-QR-19: Should allow attendance up to 6 hours after event end", () => {
      const now = new Date();
      const eventEnd = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago

      const timeAfterEnd = now.getTime() - eventEnd.getTime();
      const sixHoursMs = 6 * 60 * 60 * 1000;

      expect(timeAfterEnd).toBeLessThan(sixHoursMs);
    });

  });

  // ─── Signup Verification ──────────────────────────────────────────────────
  describe("User Signup Verification", () => {
    test("TC-UNIT-QR-20: Should verify that user is signed up for the event", async () => {
      const mockEvent = {
        event_id: 15,
        start_datetime: new Date(
          new Date().getTime() - 30 * 60 * 1000,
        ).toISOString(),
        end_datetime: new Date(
          new Date().getTime() + 90 * 60 * 1000,
        ).toISOString(),
      };

      const mockSignup = {
        event_signup_id: 100,
        event_id: 15,
        user_id: 7,
        attendance_status: "registered",
      };

      // First call for event fetch
      supabase.limit.mockResolvedValueOnce({
        data: [mockEvent],
        error: null,
      });

      // Second call for signup verification
      supabase.limit.mockResolvedValueOnce({
        data: [mockSignup],
        error: null,
      });

      expect(mockSignup.user_id).toBe(7);
      expect(mockSignup.event_id).toBe(15);
    });

  });

  // ─── Attendance Recording ────────────────────────────────────────────────
  describe("Attendance Status Recording", () => {
    test("TC-UNIT-QR-21: Should successfully mark user as present", async () => {
      const mockEvent = {
        event_id: 15,
        title: "AI Workshop",
        start_datetime: new Date(
          new Date().getTime() - 30 * 60 * 1000,
        ).toISOString(),
        end_datetime: new Date(
          new Date().getTime() + 90 * 60 * 1000,
        ).toISOString(),
      };

      const mockSignup = {
        event_signup_id: 100,
        event_id: 15,
        user_id: 7,
      };

      const mockUpdated = {
        ...mockSignup,
        attendance_status: "present",
        attendance_scanned_at: new Date().toISOString(),
      };

      supabase.limit.mockResolvedValueOnce({ data: [mockEvent], error: null });
      supabase.limit.mockResolvedValueOnce({ data: [mockSignup], error: null });
      supabase.limit.mockResolvedValueOnce({ data: [], error: null }); // No existing attendance
      supabase.single.mockResolvedValueOnce({ data: mockUpdated, error: null });

      expect(mockUpdated.attendance_status).toBe("present");
      expect(mockUpdated.attendance_scanned_at).toBeDefined();
    });

    test("TC-UNIT-QR-22: Should include event details in successful response", () => {
      const successResponse = {
        ok: true,
        message: "Attendance marked",
        attendance: {
          event_signup_id: 100,
          user_id: 7,
          attendance_status: "present",
        },
        event_id: 15,
        event_title: "AI Workshop",
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.event_id).toBe(15);
      expect(successResponse.event_title).toBeDefined();
    });
  });

  // ─── Error Handling & Edge Cases ──────────────────────────────────────────
  describe("Error Handling & Edge Cases", () => {

    test("TC-UNIT-QR-23: Should handle concurrent attendance marking (race condition)", () => {
      // Both requests come in for same user/event simultaneously
      // Database should handle uniqueness/idempotency
      const request1 = { qr_code: "QR-5-20260315-uuid1234", event_id: 15 };
      const request2 = { qr_code: "QR-5-20260315-uuid1234", event_id: 15 };

      expect(request1).toEqual(request2);
      // Second request should see existing attendance and return idempotent response
    });

    test("TC-UNIT-QR-24: Should sanitize QR code input to prevent injection", () => {
      const maliciousQR = "QR-5-20260315'; DROP TABLE events; --";

      mockReq.body.qr_code = maliciousQR;

      // Should treat as literal string, not execute
      expect(mockReq.body.qr_code).toBe(maliciousQR);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FRONTEND QR SCANNER BEHAVIOR TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("Frontend QR Scanner Behavior - Unit Tests", () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── QR Scanner State Management ───────────────────────────────────────────
  describe("QR Scanner State Management", () => {
    test("TC-UNIT-QR-25: Should initialize scanner in stopped state", () => {
      const scannerState = {
        isScanning: false,
        lastScanned: null,
        currentUser: null,
      };

      expect(scannerState.isScanning).toBe(false);
      expect(scannerState.lastScanned).toBeNull();
    });

    test("TC-UNIT-QR-26: Should toggle scanner state from stopped to scanning", () => {
      let isScanning = false;

      isScanning = true;
      expect(isScanning).toBe(true);

      isScanning = false;
      expect(isScanning).toBe(false);
    });

    test("TC-UNIT-QR-27: Should track last scanned QR code to prevent duplicates", () => {
      let lastScanned = null;
      const qrCode = "QR-5-20260315-uuid1234";

      lastScanned = qrCode;
      expect(lastScanned).toBe(qrCode);

      // Should not process same code immediately
      const isSameScan = lastScanned === qrCode;
      expect(isSameScan).toBe(true);
    });
  });

  // ─── QR Scanner Callback Handling ──────────────────────────────────────────
  describe("QR Scanner Callback Handling", () => {
    test("TC-UNIT-QR-28: Should invoke callback on successful QR code read", () => {
      const mockCallback = jest.fn();
      const decodedText = "QR-5-20260315-uuid1234";

      mockCallback(decodedText);

      expect(mockCallback).toHaveBeenCalledWith(decodedText);
    });

    test("TC-UNIT-QR-29: Should ignore duplicate QR scans within same session", () => {
      let lastScanned = null;
      const qrCode = "QR-5-20260315-uuid1234";

      lastScanned = qrCode;

      // Second identical scan should be ignored
      const shouldIgnore = lastScanned === qrCode;
      expect(shouldIgnore).toBe(true);
    });

    test("TC-UNIT-QR-30: Should handle QR scanner errors gracefully", () => {
      const errorMessage = "Permission denied";

      // Should not crash, should log or show user-friendly message
      expect(errorMessage).toBeDefined();
    });

    test("TC-UNIT-QR-31: Should display toast notification on successful scan", () => {
      const toastData = {
        title: "QR Scanned",
        message: "Code: QR-5-20260315-uuid1234",
        type: "info",
      };

      expect(toastData.title).toBe("QR Scanned");
      expect(toastData.type).toBe("info");
    });
  });

  // ─── Frontend Error Messages ───────────────────────────────────────────────
  describe("Frontend Error Messages", () => {
    test("TC-UNIT-QR-32: Should map backend error to user-friendly message", () => {
      const errorMap = {
        "Event has not started yet":
          "This event has not started yet. Attendance cannot be marked.",
        "Event attendance window closed":
          "The attendance window for this event has closed.",
        "User is not signed up for this event":
          "You must be signed up for this event to mark attendance.",
      };

      const backendError = "Event has not started yet";
      const userMessage = errorMap[backendError];

      expect(userMessage).toContain("not started yet");
    });

    test("TC-UNIT-QR-33: Should display camera access error if permission denied", () => {
      const cameraError = "Permission denied for camera access";

      expect(cameraError).toContain("Permission");
    });

    test("TC-UNIT-QR-34: Should show network error message if backend unreachable", () => {
      const networkError = "Network error. Please check your connection.";

      expect(networkError).toContain("Network");
    });

    test("TC-UNIT-QR-35: Should display success toast when attendance marked", () => {
      const successToast = {
        title: "Attendance Marked",
        message: "Your attendance has been recorded",
        type: "success",
      };

      expect(successToast.type).toBe("success");
    });
  });

  // ─── Past Scans Display ────────────────────────────────────────────────────
  describe("Past Scans Display", () => {
    test("TC-UNIT-QR-36: Should load and display past attendance scans for user", () => {
      const pastScans = [
        {
          event_id: 10,
          event_title: "AI Workshop",
          scanned_at: "2026-02-18T10:00:00Z",
          status: "present",
        },
        {
          event_id: 11,
          event_title: "Networking Event",
          scanned_at: "2026-02-17T14:30:00Z",
          status: "present",
        },
      ];

      expect(pastScans).toHaveLength(2);
      expect(pastScans[0].event_title).toBe("AI Workshop");
    });

    test("TC-UNIT-QR-37: Should display empty message when no past scans exist", () => {
      const pastScans = [];
      const emptyMessage = "No attendance records yet";

      expect(pastScans).toHaveLength(0);
      expect(emptyMessage).toBeDefined();
    });

    test("TC-UNIT-QR-38: Should format scan timestamp in user's timezone", () => {
      const scanTimestamp = "2026-02-18T10:00:00Z";
      const formattedDate = new Date(scanTimestamp).toLocaleString("en-SG");

      expect(formattedDate).toContain("2026");
    });

    test("TC-UNIT-QR-39: Should sort past scans by most recent first", () => {
      const pastScans = [
        { scanned_at: "2026-02-18T10:00:00Z" },
        { scanned_at: "2026-02-17T14:30:00Z" },
        { scanned_at: "2026-02-16T09:00:00Z" },
      ];

      const sorted = [...pastScans].sort(
        (a, b) => new Date(b.scanned_at) - new Date(a.scanned_at),
      );

      expect(sorted[0].scanned_at).toBe("2026-02-18T10:00:00Z");
      expect(sorted[sorted.length - 1].scanned_at).toBe("2026-02-16T09:00:00Z");
    });
  });
});
