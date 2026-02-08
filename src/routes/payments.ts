/**
 * Payment callback routes
 * Handles ClicToPay payment callbacks with signature verification
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { createServiceClient } from "../clients/supabaseClient";
import { createClicToPayClient } from "../clients/clictopayClient";
import type { ClicToPayCallbackPayload } from "../types/clictopay";
import { createLogger } from "../utils/logger";
import { ValidationError, ExternalServiceError } from "../middleware/errorHandler";

const payments = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * POST /payments/callback
 * Handle ClicToPay payment callback with signature verification
 * 
 * This endpoint is called by ClicToPay after payment completion
 * Flow:
 * 1. Verify HMAC signature to ensure request is from ClicToPay
 * 2. Parse callback payload
 * 3. Update payment status in database
 * 4. Update booking status based on payment result
 * 5. Optionally trigger post-payment actions (emails, confirmations)
 */
payments.post("/callback", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Payment callback received");

  try {
    const body = await c.req.json();
    
    // Validate callback payload structure
    if (!body || typeof body !== "object") {
      logger.error("Invalid callback payload", { body });
      throw new ValidationError("Invalid callback payload");
    }

    const payload = body as ClicToPayCallbackPayload;

    // Log callback (signature will be masked)
    logger.info("Processing payment callback", {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      orderStatus: payload.orderStatus,
      actionCode: payload.actionCode,
    });

    // Verify signature
    const clictopay = createClicToPayClient({
      username: c.env.CLICTOPAY_USERNAME,
      password: c.env.CLICTOPAY_PASSWORD,
      secret: c.env.CLICTOPAY_SECRET,
    });

    const isValid = await clictopay.verifyCallback(payload);

    if (!isValid) {
      logger.error("Invalid callback signature", { orderId: payload.orderId });
      throw new ValidationError("Invalid callback signature");
    }

    logger.info("Callback signature verified successfully");

    const supabase = createServiceClient(c.env);

    // Find payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*, bookings(*)")
      .eq("order_id", payload.orderId)
      .single();

    if (paymentError || !payment) {
      logger.error("Payment not found", { orderId: payload.orderId });
      throw new ValidationError(`Payment not found for order ${payload.orderId}`);
    }

    logger.info("Payment found in database", {
      paymentId: payment.id,
      bookingId: payment.booking_id,
      currentStatus: payment.status,
    });

    // Map ClicToPay status to our payment status
    // orderStatus: 0=registered, 1=pre-authorized, 2=deposited, 3=reversed, 4=refunded, 5=initiated, 6=declined
    // actionCode: 0=success, anything else is error
    let paymentStatus: "pending" | "authorized" | "captured" | "failed" | "reversed" = "pending";
    let bookingStatus: "pending" | "confirmed" | "cancelled" = "pending";

    if (payload.actionCode === 0) {
      // Success
      if (payload.orderStatus === 1) {
        paymentStatus = "authorized";
        bookingStatus = "confirmed";
      } else if (payload.orderStatus === 2) {
        paymentStatus = "captured";
        bookingStatus = "confirmed";
      } else if (payload.orderStatus === 3 || payload.orderStatus === 4) {
        paymentStatus = "reversed";
        bookingStatus = "cancelled";
      }
    } else {
      // Failed or declined
      paymentStatus = "failed";
      bookingStatus = "cancelled";
    }

    logger.info("Payment status determined", {
      paymentStatus,
      bookingStatus,
      orderStatus: payload.orderStatus,
      actionCode: payload.actionCode,
    });

    // Update payment record
    const paymentUpdates = {
      status: paymentStatus,
      action_code: payload.actionCode,
      approval_code: payload.approvalCode,
      pan: payload.pan,
      cardholder_name: payload.cardholderName,
      updated_at: new Date().toISOString(),
    };

    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update(paymentUpdates)
      .eq("id", payment.id);

    if (updatePaymentError) {
      logger.error("Failed to update payment", { error: updatePaymentError.message });
      throw new ExternalServiceError("Failed to update payment status", "Database");
    }

    // Update booking status
    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({
        status: bookingStatus,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.booking_id);

    if (updateBookingError) {
      logger.error("Failed to update booking", { error: updateBookingError.message });
      throw new ExternalServiceError("Failed to update booking status", "Database");
    }

    logger.info("Payment and booking updated successfully", {
      paymentId: payment.id,
      bookingId: payment.booking_id,
      paymentStatus,
      bookingStatus,
    });

    // TODO: Trigger post-payment actions
    // - Send confirmation email
    // - Send WhatsApp notification if consent given
    // - Update myGO booking if needed
    // - Trigger webhooks for integrations

    return c.json({
      success: true,
      paymentId: payment.id,
      bookingId: payment.booking_id,
      status: paymentStatus,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    logger.error("Payment callback processing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalServiceError("Failed to process payment callback", "Internal");
  }
});

/**
 * Health check endpoint for payment gateway
 */
payments.get("/health", async (c) => {
  return c.json({ status: "ok", service: "payments" });
});

export default payments;
