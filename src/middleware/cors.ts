/**
 * CORS middleware for Cloudflare Worker
 * Supports allowlist of origins including admin.hotel.com.tn
 */

import type { Context, Next } from "hono";
import type { Env } from "../types/env";

/**
 * Default allowed origins - fallback if ALLOWED_ORIGINS env var is not set
 * Includes the main frontend to ensure basic functionality
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.hotel.com.tn",
];

/**
 * Get allowed origins from environment variable
 * Falls back to default origins if not configured
 */
const getAllowedOrigins = (env: Env): string[] => {
  const originsStr = env.ALLOWED_ORIGINS || "";
  const origins = originsStr.split(",").map((o) => o.trim()).filter(Boolean);
  
  // If no origins configured, use defaults
  if (origins.length === 0) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  
  return origins;
};

/**
 * Check if origin is allowed
 */
const isOriginAllowed = (origin: string | null, allowedOrigins: string[]): boolean => {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
};

/**
 * CORS middleware factory
 */
export const corsMiddleware = () => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const origin = c.req.header("Origin");
    const allowedOrigins = getAllowedOrigins(c.env);

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      if (origin && isOriginAllowed(origin, allowedOrigins)) {
        return c.body(null, 204, {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        });
      }
      return c.body(null, 204);
    }

    // Process request
    await next();

    // Add CORS headers to response if origin is allowed
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
    }
  };
};
