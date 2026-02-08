/**
 * Authentication routes
 * Handles guest sessions, user registration, and login
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { createServiceClient, createAnonClient } from "../clients/supabaseClient";
import { guestSessionSchema, registerSchema, loginSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { ValidationError } from "../middleware/errorHandler";

const auth = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * POST /auth/guest
 * Create a guest session for non-authenticated users
 */
auth.post("/guest", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Creating guest session");

  try {
    const body = await c.req.json();
    const validatedData = guestSessionSchema.parse(body);

    const supabase = createServiceClient(c.env);

    // Create guest session (expires in 24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data, error } = await supabase
      .from("guest_sessions")
      .insert({
        expires_at: expiresAt.toISOString(),
        metadata: validatedData.metadata || {},
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create guest session", { error: error.message });
      throw new Error("Failed to create guest session");
    }

    logger.info("Guest session created", { sessionId: data.id });

    return c.json({
      sessionId: data.id,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid request data", error);
    }
    throw error;
  }
});

/**
 * POST /auth/register
 * Register a new user via Supabase Auth
 */
auth.post("/register", async (c) => {
  const logger = createLogger(c.var);
  logger.info("User registration attempt");

  try {
    const body = await c.req.json();
    const validatedData = registerSchema.parse(body);

    const supabase = createAnonClient(c.env);

    // Register user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: validatedData.email,
      password: validatedData.password,
      options: {
        data: {
          first_name: validatedData.firstName,
          last_name: validatedData.lastName,
        },
      },
    });

    if (error) {
      logger.error("Registration failed", { error: error.message });
      throw new ValidationError(error.message);
    }

    if (!data.user) {
      logger.error("Registration failed - no user returned");
      throw new Error("Registration failed");
    }

    logger.info("User registered successfully", { userId: data.user.id });

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: data.session
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            expiresAt: data.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid registration data", error);
    }
    throw error;
  }
});

/**
 * POST /auth/login
 * Login a user via Supabase Auth
 */
auth.post("/login", async (c) => {
  const logger = createLogger(c.var);
  logger.info("User login attempt");

  try {
    const body = await c.req.json();
    const validatedData = loginSchema.parse(body);

    const supabase = createAnonClient(c.env);

    // Login with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validatedData.email,
      password: validatedData.password,
    });

    if (error) {
      logger.warn("Login failed", { error: error.message });
      throw new ValidationError(error.message);
    }

    if (!data.user || !data.session) {
      logger.error("Login failed - no user or session returned");
      throw new Error("Login failed");
    }

    logger.info("User logged in successfully", { userId: data.user.id });

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid login data", error);
    }
    throw error;
  }
});

export default auth;
