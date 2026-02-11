/**
 * Checkout routes
 * Handles checkout initiation with policy enforcement and payment integration
 */

import { Hono } from "hono";
import { ZodError } from "zod";
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
    logger.info("Fetching booking", { 
      bookingId: validatedData.bookingId 
    });
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", validatedData.bookingId)
      .single();

    if (bookingError || !booking) {
      logger.warn("Booking not found", { bookingId: validatedData.bookingId });
      throw new NotFoundError("Booking not found");
    }
    
    logger.debug("Booking retrieved", {
      bookingId: booking.id,
      mygoBookingId: booking.mygo_booking_id,
      hotelId: booking.hotel_id,
      status: booking.status,
      totalPrice: booking.total_price,
    });

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
    let remainingCredit = 0;
    if (checkoutPolicy === "STRICT") {
      logger.info("Performing credit check (STRICT policy)", {
        bookingId: booking.id,
        requiredAmount: booking.total_price,
      });
      try {
        const credential = getMyGoCredential(c.env);
        const creditCheckResult = await creditCheck(credential);

        remainingCredit = (creditCheckResult as { remainingDeposit?: number }).remainingDeposit || 0;
        logger.info("Credit check completed", {
          remainingCredit,
          required: booking.total_price,
          sufficient: remainingCredit >= booking.total_price,
        });

        if (remainingCredit < booking.total_price) {
          logger.warn("Insufficient MyGO wallet credit", {
            bookingId: booking.id,
            required: booking.total_price,
            available: remainingCredit,
            deficit: booking.total_price - remainingCredit,
            decision: "blocked_wallet_insufficient",
          });

          // Update booking to OnRequest state when credit is insufficient
          await supabase
            .from("bookings")
            .update({
              mygo_state: "OnRequest",
              status: "pending",
            })
            .eq("id", booking.id);

          logger.info("Booking updated to OnRequest state due to insufficient credit", {
            bookingId: booking.id,
          });

          // Return blocked response instead of throwing error
          return c.json({
            blocked: true,
            reason: "wallet_insufficient",
            message: `Insufficient MyGO wallet credit. Required: ${booking.total_price} ${booking.currency}, Available: ${remainingCredit} ${booking.currency}`,
            requiredAmount: booking.total_price,
            availableCredit: remainingCredit,
            deficit: booking.total_price - remainingCredit,
            checkoutPolicy,
            bookingId: booking.id,
            bookingStatus: "pending",
            mygoState: "OnRequest",
          });
        }
      } catch (error) {
        logger.error("Credit check failed", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
          decision: "external_service_error",
        });
        throw new ExternalServiceError("Credit check failed", "MyGO");
      }
    }

    // Create ClicToPay pre-authorization order
    logger.info("Creating ClicToPay pre-authorization");
    const isTestMode = c.env.PAYMENT_TEST_MODE === "true";
    
    // In test mode, use placeholder credentials to avoid exposing production secrets
    const clictopayCredentials = isTestMode
      ? {
          username: "test-mode",
          password: "test-mode",
          secret: "test-mode",
        }
      : {
          username: c.env.CLICTOPAY_USERNAME,
          password: c.env.CLICTOPAY_PASSWORD,
          secret: c.env.CLICTOPAY_SECRET,
        };
    
    const clictopay = createClicToPayClient(clictopayCredentials, isTestMode);

    logger.info("ClicToPay client initialized", {
      testMode: isTestMode,
      decision: isTestMode ? "using_test_mode" : "using_production_mode",
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
      testMode: isTestMode,
      decision: "payment_initiated_successfully",
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
      blocked: false,
      orderId: preAuthResult.orderId,
      orderNumber: preAuthResult.orderNumber,
      formUrl: preAuthResult.formUrl,
      paymentId: payment?.id,
      checkoutPolicy,
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid checkout data", error);
    }
    logger.error("Checkout initiation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export default checkout;
