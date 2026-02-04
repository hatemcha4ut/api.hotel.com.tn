/**
 * Unified validation helpers
 */

import { ValidationError } from "./errors.ts";

// Validation constants
export const MAX_ROOMS = 10;
export const MAX_ADULTS_PER_ROOM = 10;
export const MAX_CHILDREN_PER_ROOM = 10;
export const MAX_CHILD_AGE = 17;

export interface RoomInput {
  adults: number;
  childrenAges?: number[];
}

export interface SearchParams {
  cityId: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  rooms: RoomInput[];
  currency?: "TND" | "EUR" | "USD";
}

/**
 * Validate date format (YYYY-MM-DD)
 */
const isValidDateFormat = (dateStr: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
};

/**
 * Validate that date string is a valid date
 */
const isValidDate = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

/**
 * Validate room configuration
 */
const validateRoom = (room: unknown, index: number): void => {
  if (!room || typeof room !== "object") {
    throw new ValidationError(`Room ${index + 1} must be an object`);
  }

  const r = room as RoomInput;

  if (
    !r.adults ||
    typeof r.adults !== "number" ||
    r.adults < 1 ||
    r.adults > MAX_ADULTS_PER_ROOM
  ) {
    throw new ValidationError(
      `Room ${index + 1}: adults must be 1-${MAX_ADULTS_PER_ROOM}`,
    );
  }

  if (r.childrenAges !== undefined) {
    if (!Array.isArray(r.childrenAges)) {
      throw new ValidationError(
        `Room ${index + 1}: childrenAges must be an array`,
      );
    }

    if (r.childrenAges.length > MAX_CHILDREN_PER_ROOM) {
      throw new ValidationError(
        `Room ${index + 1}: maximum ${MAX_CHILDREN_PER_ROOM} children per room`,
      );
    }

    for (const age of r.childrenAges) {
      if (
        typeof age !== "number" ||
        age < 0 ||
        age > MAX_CHILD_AGE
      ) {
        throw new ValidationError(
          `Room ${index + 1}: child ages must be 0-${MAX_CHILD_AGE}`,
        );
      }
    }
  }
};

/**
 * Validate search parameters
 */
export const validateSearchParams = (params: unknown): SearchParams => {
  if (!params || typeof params !== "object") {
    throw new ValidationError("Request body must be an object");
  }

  const p = params as Partial<SearchParams>;

  // Validate cityId
  if (!p.cityId || typeof p.cityId !== "number") {
    throw new ValidationError("cityId is required (number)");
  }

  // Validate checkIn
  if (!p.checkIn || typeof p.checkIn !== "string") {
    throw new ValidationError("checkIn is required (YYYY-MM-DD format)");
  }

  if (!isValidDateFormat(p.checkIn)) {
    throw new ValidationError("checkIn must be in YYYY-MM-DD format");
  }

  if (!isValidDate(p.checkIn)) {
    throw new ValidationError("checkIn is not a valid date");
  }

  // Validate checkOut
  if (!p.checkOut || typeof p.checkOut !== "string") {
    throw new ValidationError("checkOut is required (YYYY-MM-DD format)");
  }

  if (!isValidDateFormat(p.checkOut)) {
    throw new ValidationError("checkOut must be in YYYY-MM-DD format");
  }

  if (!isValidDate(p.checkOut)) {
    throw new ValidationError("checkOut is not a valid date");
  }

  // Validate date logic
  const checkInDate = new Date(p.checkIn);
  const checkOutDate = new Date(p.checkOut);

  if (checkOutDate <= checkInDate) {
    throw new ValidationError("checkOut must be after checkIn");
  }

  // Validate rooms
  if (!Array.isArray(p.rooms) || p.rooms.length === 0) {
    throw new ValidationError("rooms array is required (at least 1 room)");
  }

  if (p.rooms.length > MAX_ROOMS) {
    throw new ValidationError(`Maximum ${MAX_ROOMS} rooms allowed`);
  }

  // Validate each room
  p.rooms.forEach((room, index) => validateRoom(room, index));

  // Validate currency if provided
  if (p.currency && !["TND", "EUR", "USD"].includes(p.currency)) {
    throw new ValidationError("currency must be TND, EUR, or USD");
  }

  return {
    cityId: p.cityId,
    checkIn: p.checkIn,
    checkOut: p.checkOut,
    rooms: p.rooms,
    currency: p.currency,
  };
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validate phone format (basic check)
 */
export const isValidPhone = (phone: string): boolean => {
  // Allow international format with + and digits
  return /^\+?[\d\s\-()]+$/.test(phone) && phone.replace(/\D/g, "").length >= 8;
};

/**
 * Require non-empty string
 */
export const requireString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${fieldName} is required (non-empty string)`);
  }
  return value.trim();
};

/**
 * Require non-negative number
 */
export const requireNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || isNaN(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative number`);
  }
  return value;
};
