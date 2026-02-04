/**
 * Rate limiting middleware
 * 
 * Security: 
 * - Uses SHA-256 hashed IP addresses for privacy
 * - IP source order: x-forwarded-for (first IP) > x-real-ip > fallback "unknown"
 * - Note: x-forwarded-for can be spoofed; rely on trusted proxy setup
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { RateLimitError } from "./errors.ts";

/**
 * Hash a string using SHA-256
 */
const hashString = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Get client IP from request
 * 
 * Priority order (documented for security audit):
 * 1. x-forwarded-for (first IP in list) - Standard proxy header
 * 2. x-real-ip - Alternative proxy header
 * 3. "unknown" - Fallback if no IP headers present
 * 
 * IMPORTANT: These headers can be spoofed by clients.
 * Only trust these headers if your infrastructure has a trusted proxy
 * (e.g., Cloudflare, Supabase Edge Network) that sets them correctly.
 */
export const getClientIp = (request: Request): string => {
  // Try x-forwarded-for (take first IP in chain)
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // Try x-real-ip
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp;
  }

  // Fallback
  return "unknown";
};

/**
 * Check rate limit for a client
 * 
 * @param supabase - Supabase client with service role access
 * @param clientIp - Client IP address (will be hashed)
 * @param windowMinutes - Time window in minutes
 * @param maxRequests - Maximum requests allowed in window
 * @returns { allowed: boolean, remaining: number }
 * @throws RateLimitError if limit exceeded
 */
export const checkRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  clientIp: string,
  windowMinutes: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number }> => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  // Hash IP for privacy
  const keyHash = await hashString(clientIp);
  const key = `${keyHash}:${windowMinutes}m`;

  // Clean up expired entries
  await supabase
    .from("rate_limits")
    .delete()
    .lt("window_start", windowStart.toISOString());

  // Get current count for this key
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("count, window_start")
    .eq("key", key)
    .gte("window_start", windowStart.toISOString())
    .maybeSingle();

  if (!existing) {
    // First request in this window
    await supabase.from("rate_limits").upsert({
      key,
      window_start: now.toISOString(),
      count: 1,
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (existing.count >= maxRequests) {
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMinutes} minutes.`,
    );
  }

  // Increment count
  await supabase
    .from("rate_limits")
    .update({ count: existing.count + 1 })
    .eq("key", key);

  return { allowed: true, remaining: maxRequests - existing.count - 1 };
};

/**
 * Apply rate limit or fail gracefully
 * 
 * @param supabase - Supabase client
 * @param request - HTTP request
 * @param windowMinutes - Time window
 * @param maxRequests - Max requests
 * @returns Rate limit result or null if check failed (allows request)
 */
export const applyRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  request: Request,
  windowMinutes: number = 60,
  maxRequests: number = 60,
): Promise<{ allowed: boolean; remaining: number }> => {
  const clientIp = getClientIp(request);

  try {
    return await checkRateLimit(supabase, clientIp, windowMinutes, maxRequests);
  } catch (error) {
    // If it's a rate limit error, re-throw
    if (error instanceof RateLimitError) {
      throw error;
    }

    // Otherwise, log error and allow request (don't block on DB issues)
    console.error("Rate limit check failed:", error);
    return { allowed: true, remaining: -1 };
  }
};
