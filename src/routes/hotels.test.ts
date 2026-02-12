/**
 * Tests for Hotel Search Validation
 * Validates cityId coercion and error messages
 */

import { describe, it, expect } from "vitest";
import { hotelSearchSchema } from "../utils/validation";

describe("Hotel Search Schema - cityId validation", () => {
  const validBasePayload = {
    checkIn: "2025-03-01",
    checkOut: "2025-03-05",
    rooms: [{ adults: 2 }],
  };

  describe("cityId as number", () => {
    it("should accept positive integer cityId", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cityId).toBe(10);
        expect(typeof result.data.cityId).toBe("number");
      }
    });

    it("should reject zero cityId", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject negative cityId", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: -5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject non-integer cityId", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: 1.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });
  });

  describe("cityId as string (coercion)", () => {
    it("should accept valid numeric string and coerce to number", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "10",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cityId).toBe(10);
        expect(typeof result.data.cityId).toBe("number");
      }
    });

    it("should accept numeric string with leading/trailing spaces", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "  25  ",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cityId).toBe(25);
        expect(typeof result.data.cityId).toBe("number");
      }
    });

    it("should reject empty string", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject whitespace-only string", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "   ",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject non-numeric string", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "abc",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject numeric string with decimal", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "1.5",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject zero as string", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "0",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });

    it("should reject negative number as string", () => {
      const result = hotelSearchSchema.safeParse({
        ...validBasePayload,
        cityId: "-5",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive integer");
        expect(result.error.issues[0].message).toContain("/static/cities");
      }
    });
  });
});
