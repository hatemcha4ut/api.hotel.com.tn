/**
 * Request ID middleware for correlation
 * Generates or uses X-Request-ID header for tracking requests
 */

import type { Context, Next } from "hono";
import type { HonoVariables } from "../types/env";

/**
 * Generate a random request ID
 */
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Request ID middleware
 */
export const requestIdMiddleware = () => {
  return async (c: Context<{ Variables: HonoVariables }>, next: Next) => {
    // Get or generate request ID
    const requestId = c.req.header("X-Request-ID") || generateRequestId();
    
    // Store in context
    c.set("requestId", requestId);
    
    // Add to response headers
    c.header("X-Request-ID", requestId);
    
    await next();
  };
};
