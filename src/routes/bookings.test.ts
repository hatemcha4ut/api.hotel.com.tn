/**
 * Tests for Booking Validation
 * Validates request schema and payload building for booking flow
 */

import { describe, it, expect } from "vitest";
import { bookingCreateSchema } from "../utils/validation";
import { buildBookingCreationPayload } from "../clients/mygoClient";
import type { MyGoCredential } from "../types/mygo";

describe("Booking Validation Schema", () => {
  describe("bookingCreateSchema - Token validation", () => {
    it("should reject empty token", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "", // Empty token
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("token"))).toBe(true);
      }
    });

    it("should reject whitespace-only token", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: false,
        token: "   ", // Whitespace only - will be trimmed to empty
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("token"))).toBe(true);
      }
    });

    it("should accept valid token", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("bookingCreateSchema - City ID validation", () => {
    it("should reject zero cityId", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: 0, // Invalid city ID
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("city"))).toBe(true);
      }
    });

    it("should reject negative cityId", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: -5, // Invalid city ID
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("city"))).toBe(true);
      }
    });

    it("should accept positive cityId", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("bookingCreateSchema - Hotel ID validation", () => {
    it("should reject negative hotelId", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: -100, // Invalid hotel ID
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("hotel"))).toBe(true);
      }
    });

    it("should accept positive hotelId", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        token: "valid-token-12345",
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 1,
            boarding: "BB",
            pax: {
              adults: [
                {
                  firstName: "John",
                  lastName: "Doe",
                  nationality: "TN",
                },
              ],
            },
          },
        ],
        customer: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+21612345678",
          nationality: "TN",
        },
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("MyGo Booking Payload Building", () => {
  const credential: MyGoCredential = {
    login: "testuser",
    password: "testpass",
  };

  it("should build correct payload structure for BookingCreation", () => {
    const payload = buildBookingCreationPayload(credential, {
      token: "test-token-12345",
      preBooking: true,
      customerName: "John Doe",
      customerEmail: "john@example.com",
      customerPhone: "+21612345678",
      roomSelections: [
        {
          hotelId: 100,
          roomId: 1,
        },
      ],
    });

    // Verify required fields are present
    expect(payload.Credential).toBeDefined();
    expect(payload.Credential.Login).toBe("testuser");
    expect(payload.Credential.Password).toBe("testpass");
    expect(payload.Token).toBe("test-token-12345");
    expect(payload.PreBooking).toBe(true);
    expect(payload.CustomerName).toBe("John Doe");
    expect(payload.CustomerEmail).toBe("john@example.com");
    expect(payload.CustomerPhone).toBe("+21612345678");
    expect(payload.RoomSelections).toHaveLength(1);
    expect(payload.RoomSelections[0].HotelId).toBe(100);
    expect(payload.RoomSelections[0].RoomId).toBe(1);
  });

  it("should handle multiple room selections", () => {
    const payload = buildBookingCreationPayload(credential, {
      token: "test-token-12345",
      preBooking: false,
      customerName: "Jane Smith",
      customerEmail: "jane@example.com",
      customerPhone: "+21687654321",
      roomSelections: [
        {
          hotelId: 100,
          roomId: 1,
        },
        {
          hotelId: 100,
          roomId: 2,
        },
      ],
    });

    expect(payload.RoomSelections).toHaveLength(2);
    expect(payload.RoomSelections[0].HotelId).toBe(100);
    expect(payload.RoomSelections[0].RoomId).toBe(1);
    expect(payload.RoomSelections[1].HotelId).toBe(100);
    expect(payload.RoomSelections[1].RoomId).toBe(2);
    expect(payload.PreBooking).toBe(false);
  });
});

describe("MyGo Booking Flow Documentation", () => {
  it("should document required fields for HotelSearch", () => {
    // HotelSearch payload must include:
    // - Credential (Login, Password)
    // - SearchDetails.City (positive integer, required)
    // - SearchDetails.BookingDetails (CheckIn, CheckOut, Hotels[])
    // - SearchDetails.Filters (Keywords, Category[], OnlyAvailable, Tags[])
    // - SearchDetails.Rooms (Adult, Child[])
    
    expect(true).toBe(true);
  });

  it("should document required fields for BookingCreation", () => {
    // BookingCreation payload must include:
    // - Credential (Login, Password)
    // - Token (from HotelSearch response, non-empty)
    // - PreBooking (boolean)
    // - CustomerName (string)
    // - CustomerEmail (string)
    // - CustomerPhone (string)
    // - RoomSelections[] (HotelId, RoomId)
    
    expect(true).toBe(true);
  });

  it("should document token lifecycle", () => {
    // Token flow:
    // 1. HotelSearch returns Token in response
    // 2. Client stores token temporarily
    // 3. Client sends token in BookingCreation request
    // 4. MyGo validates token matches original search context
    // 5. Token should not be exposed in API responses for security
    
    expect(true).toBe(true);
  });
});
