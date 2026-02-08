/**
 * Profile routes
 * Handles user profile updates including WhatsApp consent
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { requireAuth } from "../middleware/auth";
import { createServiceClient } from "../clients/supabaseClient";
import { updateProfileSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { ValidationError, AuthenticationError } from "../middleware/errorHandler";

const profile = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// All profile routes require authentication
profile.use("/*", requireAuth());

/**
 * PUT /profile
 * Update user profile (WhatsApp number and consent)
 */
profile.put("/", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");

  if (!userId) {
    throw new AuthenticationError();
  }

  logger.info("Updating user profile", { userId });

  try {
    const body = await c.req.json();
    const validatedData = updateProfileSchema.parse(body);

    const supabase = createServiceClient(c.env);

    // Build update object
    const updates: Record<string, unknown> = {};
    if (validatedData.whatsappNumber !== undefined) {
      updates.whatsapp_number = validatedData.whatsappNumber;
    }
    if (validatedData.whatsappConsent !== undefined) {
      updates.whatsapp_consent = validatedData.whatsappConsent;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError("No fields to update");
    }

    // Update profile
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      logger.error("Failed to update profile", { error: error.message });
      throw new Error("Failed to update profile");
    }

    logger.info("Profile updated successfully", {
      userId,
      updatedFields: Object.keys(updates),
    });

    return c.json({
      id: data.id,
      whatsappNumber: data.whatsapp_number,
      whatsappConsent: data.whatsapp_consent,
      updatedAt: data.updated_at || new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid profile data", error);
    }
    throw error;
  }
});

/**
 * GET /profile
 * Get user profile
 */
profile.get("/", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");

  if (!userId) {
    throw new AuthenticationError();
  }

  logger.info("Fetching user profile", { userId });

  const supabase = createServiceClient(c.env);

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    logger.error("Failed to fetch profile", { error: error.message });
    throw new Error("Failed to fetch profile");
  }

  return c.json({
    id: data.id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    whatsappNumber: data.whatsapp_number,
    whatsappConsent: data.whatsapp_consent,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
});

export default profile;
