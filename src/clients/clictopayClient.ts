/**
 * ClicToPay REST API Client
 * Handles pre-authorization, capture (deposit), reverse, and order status operations
 */

import type {
  ClicToPayCredentials,
  ClicToPayPreAuthRequest,
  ClicToPayPreAuthResponse,
  ClicToPayOrderStatusRequest,
  ClicToPayOrderStatusResponse,
  ClicToPayDepositRequest,
  ClicToPayDepositResponse,
  ClicToPayReverseRequest,
  ClicToPayReverseResponse,
  ClicToPayCallbackPayload,
} from "../types/clictopay";
import { ExternalServiceError } from "../middleware/errorHandler";

// ClicToPay API base URL - configurable via environment
// Use test URL for testing: https://test.clictopay.com/payment/rest
// Use production URL for production: https://ipay.clictopay.com/payment/rest
const getClicToPayBaseUrl = (env?: { CLICTOPAY_BASE_URL?: string }): string => {
  return env?.CLICTOPAY_BASE_URL || "https://test.clictopay.com/payment/rest";
};

const CLICTOPAY_BASE_URL = getClicToPayBaseUrl();

// Request timeout
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Create HMAC SHA256 signature for callback verification
 */
const createHmacSignature = async (data: string, secret: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Verify HMAC signature from ClicToPay callback
 */
export const verifyCallbackSignature = async (
  payload: ClicToPayCallbackPayload,
  secret: string,
): Promise<boolean> => {
  const { signature, ...data } = payload;
  
  // Create signature string from payload (order matters!)
  const signatureString = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expectedSignature = await createHmacSignature(signatureString, secret);
  return signature === expectedSignature;
};

/**
 * Make authenticated request to ClicToPay API
 */
const clicToPayRequest = async <T>(
  credentials: ClicToPayCredentials,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const url = `${CLICTOPAY_BASE_URL}/${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Add authentication to request
    const requestBody = {
      userName: credentials.username,
      password: credentials.password,
      ...body,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new ExternalServiceError(
        `ClicToPay error ${response.status}: ${responseText.slice(0, 400)}`,
        "ClicToPay",
      );
    }

    const data = JSON.parse(responseText);

    // Check for ClicToPay error response
    if (data.errorCode && data.errorCode !== "0") {
      throw new ExternalServiceError(
        `ClicToPay error ${data.errorCode}: ${data.errorMessage || "Unknown error"}`,
        "ClicToPay",
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ExternalServiceError(
        `ClicToPay API timeout after ${REQUEST_TIMEOUT_MS}ms`,
        "ClicToPay",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Register a pre-authorization
 * Creates a payment order and returns a form URL for the customer
 */
export const registerPreAuth = async (
  credentials: ClicToPayCredentials,
  request: ClicToPayPreAuthRequest,
  testMode = false,
): Promise<ClicToPayPreAuthResponse> => {
  // In test mode, return deterministic mock response
  if (testMode) {
    const mockOrderId = `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
      orderId: mockOrderId,
      formUrl: `https://test.clictopay.com/payment/form/${mockOrderId}`,
      orderNumber: request.orderNumber,
    };
  }

  const response = await clicToPayRequest<{
    orderId: string;
    formUrl: string;
  }>(credentials, "register.do", {
    orderNumber: request.orderNumber,
    amount: request.amount,
    currency: request.currency,
    returnUrl: request.returnUrl,
    failUrl: request.failUrl,
    description: request.description,
    email: request.customerEmail,
    phone: request.customerPhone,
  });

  return {
    orderId: response.orderId,
    formUrl: response.formUrl,
    orderNumber: request.orderNumber,
  };
};

/**
 * Get order status
 * Retrieves the current status and details of a payment order
 */
export const getOrderStatus = async (
  credentials: ClicToPayCredentials,
  request: ClicToPayOrderStatusRequest,
): Promise<ClicToPayOrderStatusResponse> => {
  const response = await clicToPayRequest<Record<string, unknown>>(
    credentials,
    "getOrderStatusExtended.do",
    {
      orderId: request.orderId,
    },
  );

  return {
    orderId: String(response.orderId || request.orderId),
    orderNumber: String(response.orderNumber || ""),
    orderStatus: Number(response.orderStatus || 0),
    actionCode: Number(response.actionCode || 0),
    actionCodeDescription: String(response.actionCodeDescription || ""),
    amount: Number(response.amount || 0),
    currency: String(response.currency || ""),
    approvalCode: response.approvalCode ? String(response.approvalCode) : undefined,
    depositedAmount: response.depositedAmount ? Number(response.depositedAmount) : undefined,
    depositedDate: response.depositedDate ? String(response.depositedDate) : undefined,
    reversedAmount: response.reversedAmount ? Number(response.reversedAmount) : undefined,
    reversedDate: response.reversedDate ? String(response.reversedDate) : undefined,
    pan: response.pan ? String(response.pan) : undefined,
    cardholderName: response.cardholderName ? String(response.cardholderName) : undefined,
    ...response,
  };
};

/**
 * Deposit (capture) a pre-authorized amount
 * Captures the funds from a pre-authorized order
 */
export const deposit = async (
  credentials: ClicToPayCredentials,
  request: ClicToPayDepositRequest,
): Promise<ClicToPayDepositResponse> => {
  const response = await clicToPayRequest<Record<string, unknown>>(
    credentials,
    "deposit.do",
    {
      orderId: request.orderId,
      amount: request.amount,
    },
  );

  return {
    success: true,
    orderId: request.orderId,
    depositedAmount: Number(response.depositedAmount || request.amount),
    depositedDate: String(response.depositedDate || new Date().toISOString()),
    ...response,
  };
};

/**
 * Reverse (cancel) a pre-authorization
 * Releases the funds from a pre-authorized order
 */
export const reverse = async (
  credentials: ClicToPayCredentials,
  request: ClicToPayReverseRequest,
): Promise<ClicToPayReverseResponse> => {
  const response = await clicToPayRequest<Record<string, unknown>>(
    credentials,
    "reverse.do",
    {
      orderId: request.orderId,
    },
  );

  return {
    success: true,
    orderId: request.orderId,
    reversedAmount: Number(response.reversedAmount || 0),
    reversedDate: String(response.reversedDate || new Date().toISOString()),
    ...response,
  };
};

/**
 * Create ClicToPay client with credentials
 */
export const createClicToPayClient = (
  credentials: ClicToPayCredentials,
  testMode = false,
) => {
  return {
    registerPreAuth: (request: ClicToPayPreAuthRequest) =>
      registerPreAuth(credentials, request, testMode),
    getOrderStatus: (request: ClicToPayOrderStatusRequest) =>
      getOrderStatus(credentials, request),
    deposit: (request: ClicToPayDepositRequest) => deposit(credentials, request),
    reverse: (request: ClicToPayReverseRequest) => reverse(credentials, request),
    verifyCallback: (payload: ClicToPayCallbackPayload) =>
      verifyCallbackSignature(payload, credentials.secret),
  };
};
