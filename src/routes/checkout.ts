/**
 * Checkout routes
 * Handles checkout initiation with policy enforcement and payment integration
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { createServiceClient } from "../clients/supabaseClient";
import { createClicToPayClient } from "../clients/clictopayClient";
import { creditCheck } from "../clients/mygoClient";
import type { MyGoCredential } from "../types/mygo";
import { checkoutInitiateSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import {
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  InsufficientCreditError,
  AuthenticationError,
} from "../middleware/errorHandler";
import { optionalAuth } from "../middleware/auth";

const checkout = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Apply optional auth to all routes
checkout.use("/*", optionalAuth());

/**
 * Helper to create MyGO credential from environment
 */
const getMyGoCredential = (env: Env): MyGoCredential => ({
  login: env.MYGO_LOGIN,
  password: env.MYGO_PASSWORD,
});

/**
 * POST /checkout/initiate
 * Initiate checkout process with policy enforcement
 * 
 * Flow:
 * 1. Read checkout policy from database
 * 2. Verify booking exists and is accessible by user
 * 3. If STRICT policy: Perform credit check with myGO
 * 4. Create ClicToPay pre-authorization order
 * 5. Return payment form URL for customer
 */
checkout.post("/initiate", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");
  const guestSessionId = c.get("guestSessionId");

  logger.info("Checkout initiation request", { userId, hasGuestSession: !!guestSessionId });

  // Require either authenticated user or guest session
  if (!userId && !guestSessionId) {
    throw new AuthenticationError("Authentication or guest session required");
  }

  try {
    const body = await c.req.json();
    const validatedData = checkoutInitiateSchema.parse(body);

    const supabase = createServiceClient(c.env);

    // Fetch booking from database
    logger.info("Fetching booking", { bookingId: validatedData.bookingId });
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", validatedData.bookingId)
      .single();

    if (bookingError || !booking) {
      logger.warn("Booking not found", { bookingId: validatedData.bookingId });
      throw new NotFoundError("Booking not found");
    }

    // Verify access - user must own the booking
    if (userId && booking.user_id !== userId) {
      logger.warn("Unauthorized checkout attempt", { bookingId: validatedData.bookingId, userId });
      throw new NotFoundError("Booking not found");
    }

    if (!userId && guestSessionId && booking.guest_session_id !== guestSessionId) {
      logger.warn("Unauthorized guest checkout attempt", {
        bookingId: validatedData.bookingId,
        guestSessionId,
      });
      throw new NotFoundError("Booking not found");
    }

    // Verify booking is in pending state
    if (booking.status !== "pending") {
      logger.warn("Booking not in pending state", {
        bookingId: validatedData.bookingId,
        status: booking.status,
      });
      throw new ValidationError(`Booking is ${booking.status}, cannot initiate checkout`);
    }

    // Read checkout policy from settings
    logger.info("Reading checkout policy");
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("checkout_policy")
      .limit(1)
      .single();

    if (settingsError) {
      logger.warn("Failed to read checkout policy, using default", { error: settingsError.message });
    }

    const checkoutPolicy = settings?.checkout_policy || "ON_HOLD_PREAUTH";
    logger.info("Checkout policy determined", { policy: checkoutPolicy });

    // If STRICT policy, perform credit check with myGO
    if (checkoutPolicy === "STRICT") {
      logger.info("Performing credit check (STRICT policy)");
      try {
        const credential = getMyGoCredential(c.env);
        const creditCheckResult = await creditCheck(credential);

        const remainingCredit = (creditCheckResult as { remainingDeposit?: number }).remainingDeposit || 0;
        logger.info("Credit check result", {
          remainingCredit,
          required: booking.total_price,
        });

        if (remainingCredit < booking.total_price) {
          logger.warn("Insufficient credit for booking", {
            required: booking.total_price,
            available: remainingCredit,
          });
          throw new InsufficientCreditError(
            `Insufficient credit. Required: ${booking.total_price}, Available: ${remainingCredit}`
          );
        }
      } catch (error) {
        if (error instanceof InsufficientCreditError) {
          throw error;
        }
        logger.error("Credit check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ExternalServiceError("Credit check failed", "MyGO");
      }
    }

    // Create ClicToPay pre-authorization order
    logger.info("Creating ClicToPay pre-authorization");
    const clictopay = createClicToPayClient({
      username: c.env.CLICTOPAY_USERNAME,
      password: c.env.CLICTOPAY_PASSWORD,
      secret: c.env.CLICTOPAY_SECRET,
    });

    // Generate unique order number
    const orderNumber = `BK-${booking.id.substring(0, 8)}-${Date.now()}`;

    // Convert amount to minor units (millimes for TND: 1 TND = 1000 millimes)
    const TND_TO_MILLIMES = 1000;
    const amountInMinorUnits = Math.round(booking.total_price * TND_TO_MILLIMES);

    const preAuthResult = await clictopay.registerPreAuth({
      orderNumber,
      amount: amountInMinorUnits,
      currency: booking.currency === "TND" ? "788" : "978", // ISO 4217 numeric codes
      returnUrl: validatedData.returnUrl,
      failUrl: validatedData.failUrl,
      description: `Hotel booking ${booking.hotel_name} - ${booking.check_in} to ${booking.check_out}`,
      customerEmail: booking.customer_email,
      customerPhone: booking.customer_phone,
    });

    logger.info("ClicToPay pre-auth created", {
      orderId: preAuthResult.orderId,
      orderNumber: preAuthResult.orderNumber,
    });

    // Store payment record in database
    const paymentData = {
      booking_id: booking.id,
      order_id: preAuthResult.orderId,
      order_number: orderNumber,
      amount: booking.total_price,
      currency: booking.currency,
      status: "pending",
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) {
      logger.error("Failed to store payment record", { error: paymentError.message });
      // Don't fail - ClicToPay order is created
    }

    // Update booking status to indicate payment initiated
    await supabase
      .from("bookings")
      .update({ payment_status: "pending" })
      .eq("id", booking.id);

    return c.json({
      orderId: preAuthResult.orderId,
      orderNumber: preAuthResult.orderNumber,
      formUrl: preAuthResult.formUrl,
      paymentId: payment?.id,
      checkoutPolicy,
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof InsufficientCreditError
    ) {
      throw error;
    }
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid checkout data", error);
    }
    logger.error("Checkout initiation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export default checkout;
