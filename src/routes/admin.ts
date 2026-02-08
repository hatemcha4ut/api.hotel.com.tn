/**
 * Admin routes
 * Handles admin-only operations including myGO credit monitoring, settings, and booking management
 */

import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { Env, HonoVariables } from "../types/env";
import { requireAdmin } from "../middleware/auth";
import { createServiceClient } from "../clients/supabaseClient";
import { creditCheck } from "../clients/mygoClient";
import { checkoutPolicySchema, bookingListFiltersSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { ValidationError } from "../middleware/errorHandler";
import type { CheckoutPolicy } from "../types/booking";

const admin = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// All admin routes require admin authentication
admin.use("/*", requireAdmin());

/**
 * GET /api/admin/mygo/credit
 * Get current myGO credit balance (snapshot)
 */
admin.get("/mygo/credit", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching myGO credit balance");

  const credentials = {
    login: c.env.MYGO_LOGIN,
    password: c.env.MYGO_PASSWORD,
  };

  const creditData = await creditCheck(credentials, {});
  
  logger.info("myGO credit fetched", {
    remainingDeposit: creditData.RemainingDeposit,
    currency: creditData.Currency,
  });

  return c.json({
    remainingDeposit: creditData.RemainingDeposit,
    currency: creditData.Currency,
    fetchedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/mygo/credit/stream
 * Server-Sent Events (SSE) stream for real-time credit monitoring
 * Sends heartbeat every 30 seconds and credit updates every 5 minutes
 */
admin.get("/mygo/credit/stream", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Starting myGO credit SSE stream");

  return stream(c, async (stream) => {
    const credentials = {
      login: c.env.MYGO_LOGIN,
      password: c.env.MYGO_PASSWORD,
    };

    let lastCreditCheck = 0;
    const CREDIT_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

    try {
      // Send initial credit data
      const initialCredit = await creditCheck(credentials, {});
      await stream.writeln(`event: credit_update`);
      await stream.writeln(
        `data: ${JSON.stringify({
          remainingDeposit: initialCredit.RemainingDeposit,
          currency: initialCredit.Currency,
          timestamp: new Date().toISOString(),
        })}`
      );
      await stream.writeln("");
      lastCreditCheck = Date.now();

      // Keep connection alive with heartbeat and periodic credit updates
      const intervalId = setInterval(async () => {
        const now = Date.now();

        // Check if we should fetch new credit data
        if (now - lastCreditCheck >= CREDIT_CHECK_INTERVAL) {
          try {
            const creditData = await creditCheck(credentials, {});
            await stream.writeln(`event: credit_update`);
            await stream.writeln(
              `data: ${JSON.stringify({
                remainingDeposit: creditData.RemainingDeposit,
                currency: creditData.Currency,
                timestamp: new Date().toISOString(),
              })}`
            );
            await stream.writeln("");
            lastCreditCheck = now;
          } catch (error) {
            logger.error("Failed to fetch credit in SSE stream", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          // Send heartbeat
          await stream.writeln(`event: heartbeat`);
          await stream.writeln(
            `data: ${JSON.stringify({ timestamp: new Date().toISOString() })}`
          );
          await stream.writeln("");
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on disconnect
      stream.onAbort(() => {
        clearInterval(intervalId);
        logger.info("myGO credit SSE stream closed");
      });
    } catch (error) {
      logger.error("Error in SSE stream", {
        error: error instanceof Error ? error.message : String(error),
      });
      await stream.writeln(`event: error`);
      await stream.writeln(
        `data: ${JSON.stringify({ error: "Failed to fetch credit data" })}`
      );
      await stream.writeln("");
    }
  });
});

/**
 * GET /api/admin/settings/checkout-policy
 * Get current checkout policy setting
 */
admin.get("/settings/checkout-policy", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching checkout policy");

  const supabase = createServiceClient(c.env);

  const { data, error } = await supabase
    .from("settings")
    .select("value, updated_at")
    .eq("key", "checkout-policy")
    .single();

  if (error) {
    logger.error("Failed to fetch checkout policy", { error: error.message });
    throw new Error("Failed to fetch checkout policy");
  }

  const policy = data.value as CheckoutPolicy;

  return c.json({
    policy: policy.policy,
    updatedAt: data.updated_at,
  });
});

/**
 * PUT /api/admin/settings/checkout-policy
 * Update checkout policy and create audit log entry
 */
admin.put("/settings/checkout-policy", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");

  if (!userId) {
    throw new Error("User ID not found in context");
  }

  logger.info("Updating checkout policy", { userId });

  try {
    const body = await c.req.json();
    const validatedData = checkoutPolicySchema.parse(body);

    const supabase = createServiceClient(c.env);

    // Get old value for audit log
    const { data: oldData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "checkout-policy")
      .single();

    const oldValue = oldData?.value || null;
    const newValue = { policy: validatedData.policy };

    // Update setting
    const { error: updateError } = await supabase
      .from("settings")
      .upsert({
        key: "checkout-policy",
        value: newValue,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });

    if (updateError) {
      logger.error("Failed to update checkout policy", {
        error: updateError.message,
      });
      throw new Error("Failed to update checkout policy");
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from("settings_audit_log")
      .insert({
        setting_key: "checkout-policy",
        old_value: oldValue,
        new_value: newValue,
        changed_by: userId,
        changed_at: new Date().toISOString(),
      });

    if (auditError) {
      logger.warn("Failed to create audit log entry", {
        error: auditError.message,
      });
      // Don't fail the request if audit log fails
    }

    logger.info("Checkout policy updated successfully", {
      userId,
      policy: validatedData.policy,
    });

    return c.json({
      policy: validatedData.policy,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid policy data", error);
    }
    throw error;
  }
});

/**
 * GET /api/admin/bookings
 * List bookings with filters (status, date range, pagination)
 */
admin.get("/bookings", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching bookings list");

  try {
    const query = c.req.query();
    const validatedFilters = bookingListFiltersSchema.parse({
      status: query.status,
      fromCheckIn: query.fromCheckIn,
      toCheckIn: query.toCheckIn,
      fromCheckOut: query.fromCheckOut,
      toCheckOut: query.toCheckOut,
      page: query.page ? Number(query.page) : undefined,
      perPage: query.perPage ? Number(query.perPage) : undefined,
    });

    const supabase = createServiceClient(c.env);

    // Build query
    let queryBuilder = supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    // Apply filters
    if (validatedFilters.status) {
      queryBuilder = queryBuilder.eq("status", validatedFilters.status);
    }
    if (validatedFilters.fromCheckIn) {
      queryBuilder = queryBuilder.gte("check_in", validatedFilters.fromCheckIn);
    }
    if (validatedFilters.toCheckIn) {
      queryBuilder = queryBuilder.lte("check_in", validatedFilters.toCheckIn);
    }
    if (validatedFilters.fromCheckOut) {
      queryBuilder = queryBuilder.gte("check_out", validatedFilters.fromCheckOut);
    }
    if (validatedFilters.toCheckOut) {
      queryBuilder = queryBuilder.lte("check_out", validatedFilters.toCheckOut);
    }

    // Apply pagination
    const page = validatedFilters.page || 1;
    const perPage = validatedFilters.perPage || 30;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    queryBuilder = queryBuilder.range(from, to);

    const { data, error, count } = await queryBuilder;

    if (error) {
      logger.error("Failed to fetch bookings", { error: error.message });
      throw new Error("Failed to fetch bookings");
    }

    logger.info("Bookings fetched successfully", {
      count: data?.length || 0,
      total: count || 0,
    });

    return c.json({
      bookings: data || [],
      pagination: {
        page,
        perPage,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / perPage),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid filter parameters", error);
    }
    throw error;
  }
});

export default admin;
