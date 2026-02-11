/**
 * Authentication middleware for JWT validation
 * Supports guest sessions, user authentication, and admin authorization
 */

import type { Context, Next } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { createClient } from "@supabase/supabase-js";
import { getCookie } from "hono/cookie";

/**
 * Verify JWT token using Supabase client
 */
const verifyToken = async (token: string, env: Env) => {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
};

/**
 * Check if user has admin role
 */
const isUserAdmin = async (userId: string, env: Env): Promise<boolean> => {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.role === "admin";
};

/**
 * Optional authentication middleware
 * Extracts user info if token is present, but doesn't require it
 */
export const optionalAuth = () => {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const user = await verifyToken(token, c.env);
      
      if (user) {
        c.set("userId", user.id);
        
        // Check if admin
        const isAdmin = await isUserAdmin(user.id, c.env);
        c.set("isAdmin", isAdmin);
      }
    }
    
    await next();
  };
};

/**
 * Require authentication middleware
 * Returns 401 if no valid JWT token is present
 */
export const requireAuth = () => {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    
    const token = authHeader.substring(7);
    const user = await verifyToken(token, c.env);
    
    if (!user) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
    
    c.set("userId", user.id);
    
    // Check if admin
    const isAdmin = await isUserAdmin(user.id, c.env);
    c.set("isAdmin", isAdmin);
    
    await next();
  };
};

/**
 * Require admin middleware
 * Returns 403 if user is not an admin
 */
export const requireAdmin = () => {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) => {
    // First ensure user is authenticated
    const authHeader = c.req.header("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }
    
    const token = authHeader.substring(7);
    const user = await verifyToken(token, c.env);
    
    if (!user) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
    
    c.set("userId", user.id);
    
    // Check if admin
    const isAdmin = await isUserAdmin(user.id, c.env);
    c.set("isAdmin", isAdmin);
    
    if (!isAdmin) {
      return c.json({ error: "Admin access required" }, 403);
    }
    
    await next();
  };
};

/**
 * Extract guest session ID from header or cookie
 */
export const extractGuestSession = () => {
  return async (c: Context<{ Variables: HonoVariables }>, next: Next) => {
    const guestSessionId =
      c.req.header("X-Guest-Session-ID") || getCookie(c, "guest_session_id");
    
    if (guestSessionId) {
      c.set("guestSessionId", guestSessionId);
    }
    
    await next();
  };
};
