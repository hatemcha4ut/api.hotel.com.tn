/**
 * ClicToPay API types
 * Types for ClicToPay payment gateway integration
 */

export interface ClicToPayCredentials {
  username: string;
  password: string;
  secret: string; // HMAC secret for callback verification
}

// Pre-authorization request
export interface ClicToPayPreAuthRequest {
  orderNumber: string;
  amount: number; // Amount in minor units (e.g., 10050 for 100.50 TND)
  currency: string; // ISO 4217 currency code (e.g., "788" for TND)
  returnUrl: string;
  failUrl: string;
  description?: string;
  customerEmail?: string;
  customerPhone?: string;
}

// Pre-authorization response
export interface ClicToPayPreAuthResponse {
  orderId: string;
  formUrl: string;
  orderNumber: string;
}

// Order status request
export interface ClicToPayOrderStatusRequest {
  orderId: string;
}

// Order status response
export interface ClicToPayOrderStatusResponse {
  orderId: string;
  orderNumber: string;
  orderStatus: number; // 0=created, 1=approved, 2=deposited, 3=reversed, 4=declined, 5=expired
  actionCode: number;
  actionCodeDescription?: string;
  amount: number;
  currency: string;
  approvalCode?: string;
  depositedAmount?: number;
  depositedDate?: string;
  reversedAmount?: number;
  reversedDate?: string;
  pan?: string; // Masked card number
  cardholderName?: string;
  [key: string]: unknown;
}

// Deposit (capture) request
export interface ClicToPayDepositRequest {
  orderId: string;
  amount: number; // Amount to capture (can be less than pre-authorized amount)
}

// Deposit response
export interface ClicToPayDepositResponse {
  success: boolean;
  orderId: string;
  depositedAmount: number;
  depositedDate: string;
  [key: string]: unknown;
}

// Reverse (cancel pre-auth) request
export interface ClicToPayReverseRequest {
  orderId: string;
}

// Reverse response
export interface ClicToPayReverseResponse {
  success: boolean;
  orderId: string;
  reversedAmount: number;
  reversedDate: string;
  [key: string]: unknown;
}

// Callback payload (from ClicToPay after payment)
export interface ClicToPayCallbackPayload {
  orderId: string;
  orderNumber: string;
  orderStatus: number;
  actionCode: number;
  amount: number;
  currency: string;
  approvalCode?: string;
  pan?: string;
  signature: string; // HMAC signature for verification
  [key: string]: unknown;
}

// Order status enum for easier handling
export enum ClicToPayOrderStatus {
  CREATED = 0,
  APPROVED = 1,
  DEPOSITED = 2,
  REVERSED = 3,
  DECLINED = 4,
  EXPIRED = 5,
}
