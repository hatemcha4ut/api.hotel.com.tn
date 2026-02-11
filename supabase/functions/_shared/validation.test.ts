/**
 * Tests for validation module
 * 
 * Specifically tests cityId validation to ensure missing City field
 * in MyGo HotelSearch payload is prevented
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateSearchParams } from "./validation.ts";
import { ValidationError } from "./errors.ts";

// Test: validateSearchParams should reject cityId = 0
Deno.test("validateSearchParams should reject cityId = 0", () => {
  const params = {
    cityId: 0,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should reject negative cityId
Deno.test("validateSearchParams should reject negative cityId", () => {
  const params = {
    cityId: -5,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should reject non-integer cityId
Deno.test("validateSearchParams should reject non-integer cityId (float)", () => {
  const params = {
    cityId: 1.5,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should reject missing cityId
Deno.test("validateSearchParams should reject missing cityId", () => {
  const params = {
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should reject null cityId
Deno.test("validateSearchParams should reject null cityId", () => {
  const params = {
    cityId: null,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should reject undefined cityId
Deno.test("validateSearchParams should reject undefined cityId", () => {
  const params = {
    cityId: undefined,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2 }],
  };

  assertThrows(
    () => validateSearchParams(params),
    ValidationError,
    "cityId is required (positive integer)",
  );
});

// Test: validateSearchParams should accept valid positive integer cityId
Deno.test("validateSearchParams should accept valid positive integer cityId", () => {
  const params = {
    cityId: 42,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 2, childrenAges: [5, 8] }],
    currency: "TND" as const,
  };

  const result = validateSearchParams(params);
  
  assertEquals(result.cityId, 42);
  assertEquals(result.checkIn, "2025-01-10");
  assertEquals(result.checkOut, "2025-01-12");
  assertEquals(result.rooms.length, 1);
  assertEquals(result.rooms[0].adults, 2);
  assertEquals(result.rooms[0].childrenAges, [5, 8]);
  assertEquals(result.currency, "TND");
});

// Test: validateSearchParams should accept cityId = 1 (minimum valid)
Deno.test("validateSearchParams should accept cityId = 1 (minimum valid)", () => {
  const params = {
    cityId: 1,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    rooms: [{ adults: 1 }],
  };

  const result = validateSearchParams(params);
  assertEquals(result.cityId, 1);
});

console.log("✅ All validation tests passed");
