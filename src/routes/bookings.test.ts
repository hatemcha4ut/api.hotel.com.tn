/**
 * Tests for Booking Validation
 * Validates request schema and payload building for booking flow
 */

import { describe, it, expect } from "vitest";
import { bookingCreateSchema, searchParamsSchema, selectedOfferSchema, tokenFreeBookingSchema } from "../utils/validation";
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

describe("Token-Free Booking Schema", () => {
  describe("searchParamsSchema", () => {
    it("should accept valid search parameters", () => {
      const result = searchParamsSchema.safeParse({
        cityId: 1,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            adults: 2,
            childrenAges: [5, 8],
          },
        ],
        currency: "TND",
      });

      expect(result.success).toBe(true);
    });

    it("should reject zero cityId", () => {
      const result = searchParamsSchema.safeParse({
        cityId: 0,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [{ adults: 2 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes("cityId"))).toBe(true);
      }
    });

    it("should reject negative cityId", () => {
      const result = searchParamsSchema.safeParse({
        cityId: -1,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [{ adults: 2 }],
      });

      expect(result.success).toBe(false);
    });

    it("should accept optional currency", () => {
      const result = searchParamsSchema.safeParse({
        cityId: 1,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [{ adults: 2 }],
        // No currency provided
      });

      expect(result.success).toBe(true);
    });

    it("should validate currency enum", () => {
      const result = searchParamsSchema.safeParse({
        cityId: 1,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [{ adults: 2 }],
        currency: "INVALID",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("selectedOfferSchema", () => {
    it("should accept valid offer", () => {
      const result = selectedOfferSchema.safeParse({
        hotelId: 100,
        roomId: 5,
        boardCode: "BB",
        price: 250.50,
      });

      expect(result.success).toBe(true);
    });

    it("should reject zero hotelId", () => {
      const result = selectedOfferSchema.safeParse({
        hotelId: 0,
        roomId: 5,
      });

      expect(result.success).toBe(false);
    });

    it("should reject negative roomId", () => {
      const result = selectedOfferSchema.safeParse({
        hotelId: 100,
        roomId: -1,
      });

      expect(result.success).toBe(false);
    });

    it("should accept optional fields", () => {
      const result = selectedOfferSchema.safeParse({
        hotelId: 100,
        roomId: 5,
        // boardCode and price are optional
      });

      expect(result.success).toBe(true);
    });
  });

  describe("tokenFreeBookingSchema", () => {
    const validTokenFreeBooking = {
      preBooking: true,
      searchParams: {
        cityId: 1,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [{ adults: 2, childrenAges: [5] }],
        currency: "TND",
      },
      selectedOffer: {
        hotelId: 100,
        roomId: 5,
      },
      rooms: [
        {
          id: 5,
          boarding: "BB",
          pax: {
            adults: [
              {
                firstName: "John",
                lastName: "Doe",
                nationality: "TN",
              },
              {
                firstName: "Jane",
                lastName: "Doe",
                nationality: "TN",
              },
            ],
            children: [
              {
                firstName: "Johnny",
                lastName: "Doe",
                nationality: "TN",
                age: 5,
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
    };

    it("should accept valid token-free booking request", () => {
      const result = tokenFreeBookingSchema.safeParse(validTokenFreeBooking);

      expect(result.success).toBe(true);
    });

    it("should default preBooking to true", () => {
      const requestWithoutPreBooking = {
        ...validTokenFreeBooking,
        preBooking: undefined,
      };
      const result = tokenFreeBookingSchema.safeParse(requestWithoutPreBooking);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preBooking).toBe(true);
      }
    });

    it("should reject missing searchParams", () => {
      const { searchParams, ...requestWithoutSearchParams } = validTokenFreeBooking;
      const result = tokenFreeBookingSchema.safeParse(requestWithoutSearchParams);

      expect(result.success).toBe(false);
    });

    it("should reject missing selectedOffer", () => {
      const { selectedOffer, ...requestWithoutOffer } = validTokenFreeBooking;
      const result = tokenFreeBookingSchema.safeParse(requestWithoutOffer);

      expect(result.success).toBe(false);
    });

    it("should reject missing customer", () => {
      const { customer, ...requestWithoutCustomer } = validTokenFreeBooking;
      const result = tokenFreeBookingSchema.safeParse(requestWithoutCustomer);

      expect(result.success).toBe(false);
    });

    it("should reject invalid cityId in searchParams", () => {
      const requestWithInvalidCity = {
        ...validTokenFreeBooking,
        searchParams: {
          ...validTokenFreeBooking.searchParams,
          cityId: -1,
        },
      };
      const result = tokenFreeBookingSchema.safeParse(requestWithInvalidCity);

      expect(result.success).toBe(false);
    });
  });

  describe("bookingCreateSchema - Token-free mode", () => {
    it("should accept token-free booking with searchParams and selectedOffer", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        // No token provided
        searchParams: {
          cityId: 1,
          checkIn: "2025-03-01",
          checkOut: "2025-03-05",
          rooms: [{ adults: 2 }],
          currency: "TND",
        },
        selectedOffer: {
          hotelId: 100,
          roomId: 5,
        },
        methodPayment: "credit_card",
        currency: "TND",
        city: 1,
        hotel: 100,
        checkIn: "2025-03-01",
        checkOut: "2025-03-05",
        rooms: [
          {
            id: 5,
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

    it("should accept legacy token-based booking", () => {
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

    it("should reject when neither token nor searchParams provided", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        // No token
        // No searchParams
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
        // Should error on token field due to refine validation
        expect(result.error.issues.some(issue => issue.path.includes("token"))).toBe(true);
      }
    });

    it("should reject when only searchParams provided without selectedOffer", () => {
      const result = bookingCreateSchema.safeParse({
        preBooking: true,
        searchParams: {
          cityId: 1,
          checkIn: "2025-03-01",
          checkOut: "2025-03-05",
          rooms: [{ adults: 2 }],
        },
        // Missing selectedOffer
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
    });
  });
});
