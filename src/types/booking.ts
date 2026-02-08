/**
 * Internal booking types
 * Types for internal booking management
 */

export type BookingMode = "AVEC_COMPTE" | "SANS_COMPTE";
export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "reversed";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface InternalBooking {
  id: string;
  userId?: string;
  guestSessionId?: string;
  mode: BookingMode;
  mygoBookingId?: number;
  mygoState?: string;
  hotelId: number;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  totalPrice: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  guestWhatsappNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternalPayment {
  id: string;
  bookingId: string;
  orderId?: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  approvalCode?: string;
  actionCode?: number;
  pan?: string;
  cardholderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutPolicy {
  policy: "STRICT" | "ON_HOLD_PREAUTH";
}

export interface GuestSession {
  id: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
}
