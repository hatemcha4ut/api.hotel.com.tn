/**
 * Validation utilities using Zod
 * Schema definitions for all API inputs
 */

import { z } from "zod";

// Common validation schemas
export const emailSchema = z.string().email();
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/); // E.164 format
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
export const uuidSchema = z.string().uuid();

// Auth schemas
export const guestSessionSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string(),
});

// Profile schema
export const updateProfileSchema = z.object({
  whatsappNumber: phoneSchema.optional(),
  whatsappConsent: z.boolean().optional(),
});

// Hotel search schema
export const roomSchema = z.object({
  adults: z.number().int().min(1).max(10),
  childrenAges: z.array(z.number().int().min(0).max(17)).optional(),
});

export const hotelSearchSchema = z.object({
  cityId: z.number().int().positive("cityId must be a positive integer"),
  checkIn: dateSchema,
  checkOut: dateSchema,
  rooms: z.array(roomSchema).min(1).max(10),
  hotelIds: z.array(z.number().int().positive()).optional(),
  currency: z.enum(["TND", "EUR", "USD"]).optional(),
  onlyAvailable: z.boolean().optional(),
  keywords: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

// Hotel detail schema
export const hotelDetailSchema = z.object({
  hotelId: z.number().int().positive(),
  currency: z.enum(["TND", "EUR", "USD"]).optional(),
});

// Booking schemas
export const paxSchema = z.object({
  adults: z.array(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      nationality: z.string().length(2), // ISO 3166-1 alpha-2
    })
  ),
  children: z
    .array(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        nationality: z.string().length(2),
        age: z.number().int().min(0).max(17),
      })
    )
    .optional(),
});

export const bookingRoomSchema = z.object({
  id: z.number().int(),
  boarding: z.string(),
  views: z.array(z.number().int()).optional(),
  supplements: z.array(z.number().int()).optional(),
  pax: paxSchema,
});

export const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: emailSchema,
  phone: phoneSchema,
  nationality: z.string().length(2),
});

export const bookingCreateSchema = z.object({
  preBooking: z.boolean(),
  token: z.string(),
  methodPayment: z.string(),
  currency: z.string(),
  city: z.number().int(),
  hotel: z.number().int(),
  checkIn: dateSchema,
  checkOut: dateSchema,
  options: z
    .array(
      z.object({
        id: z.number().int(),
        quantity: z.number().int().positive(),
      })
    )
    .optional(),
  rooms: z.array(bookingRoomSchema),
  customer: customerSchema,
});

// Checkout schema
export const checkoutInitiateSchema = z.object({
  bookingId: z.string().uuid(),
  returnUrl: z.string().url(),
  failUrl: z.string().url(),
});

// Admin schemas
export const checkoutPolicySchema = z.object({
  policy: z.enum(["STRICT", "ON_HOLD_PREAUTH"]),
});

export const bookingListFiltersSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional(),
  fromCheckIn: dateSchema.optional(),
  toCheckIn: dateSchema.optional(),
  fromCheckOut: dateSchema.optional(),
  toCheckOut: dateSchema.optional(),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional(),
});

// Validation helpers
export const validateString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
};

export const validateNumber = (value: unknown, fieldName: string): number => {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return num;
};

export const validateEmail = (email: string): boolean => {
  return emailSchema.safeParse(email).success;
};

export const validatePhone = (phone: string): boolean => {
  return phoneSchema.safeParse(phone).success;
};
