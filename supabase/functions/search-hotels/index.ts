import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  searchHotels,
  filterVisibleHotels,
  type MyGoCredential,
  type MyGoSearchParams,
} from "../_shared/lib/mygoClient.ts";
import { getCorsHeaders, handleOptions, jsonResponse, isOriginAllowed } from "../_shared/cors.ts";
import { applyRateLimit } from "../_shared/rateLimit.ts";
import { validateSearchParams } from "../_shared/validation.ts";
import { formatError, ValidationError, ExternalServiceError } from "../_shared/errors.ts";

// Cache configuration
const CACHE_TTL_SECONDS = 120;

/**
 * Generate deterministic cache key from normalized search params
 * IMPORTANT: Key must be deterministic and token-free
 */
const getCacheKey = (params: MyGoSearchParams): string => {
  // Normalize and sort to ensure deterministic key
  return JSON.stringify({
    cityId: params.cityId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    rooms: params.rooms,
    currency: params.currency ?? "TND",
  });
};

/**
 * Get response from cache
 */
const getFromCache = async (
  supabase: ReturnType<typeof createClient>,
  cacheKey: string,
): Promise<unknown | null> => {
  const now = new Date();

  // Clean expired entries
  await supabase
    .from("search_cache")
    .delete()
    .lt("expires_at", now.toISOString());

  const { data } = await supabase
    .from("search_cache")
    .select("response_json")
    .eq("key", cacheKey)
    .gt("expires_at", now.toISOString())
    .maybeSingle();

  return data?.response_json ?? null;
};

/**
 * Store response in cache
 * SECURITY: Cache must never contain tokens
 */
const setCache = async (
  supabase: ReturnType<typeof createClient>,
  cacheKey: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // Verify value doesn't contain token before caching
  if (value && typeof value === "object" && "token" in value) {
    console.error("SECURITY: Attempted to cache response with token field");
    throw new Error("Cannot cache response containing token");
  }

  await supabase.from("search_cache").upsert({
    key: cacheKey,
    expires_at: expiresAt.toISOString(),
    response_json: value,
  });
};

/**
 * Get MyGo credentials from environment
 */
const getMyGoCredential = (): MyGoCredential => {
  const login = Deno.env.get("MYGO_LOGIN");
  const password = Deno.env.get("MYGO_PASSWORD");

  if (!login || !password) {
    throw new Error("MYGO_LOGIN and MYGO_PASSWORD must be configured");
  }

  return { login, password };
};

serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";

  // Check origin
  if (origin && !isOriginAllowed(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return handleOptions(origin);
  }

  // Only POST allowed
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Apply rate limiting
    await applyRateLimit(supabase, request, 60, 60);

    // Parse and validate request body
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ValidationError("Invalid JSON payload");
    }

    const searchParams = validateSearchParams(payload);

    // Build MyGo search params
    const mygoParams: MyGoSearchParams = {
      cityId: searchParams.cityId,
      checkIn: searchParams.checkIn,
      checkOut: searchParams.checkOut,
      rooms: searchParams.rooms,
      currency: searchParams.currency,
      onlyAvailable: true, // Always true for real-time availability
    };

    // Check cache (cache is token-free)
    const cacheKey = getCacheKey(mygoParams);
    const cached = await getFromCache(supabase, cacheKey);

    if (cached) {
      // Verify cached response doesn't contain token
      if (cached && typeof cached === "object" && "token" in cached) {
        console.error("SECURITY: Cached data contains token field, invalidating cache");
        // Delete the corrupted cache entry
        await supabase.from("search_cache").delete().eq("key", cacheKey);
      } else {
        return jsonResponse(cached as Record<string, unknown>, 200, origin);
      }
    }

    // Call MyGo API
    const credential = getMyGoCredential();
    const searchResult = await searchHotels(credential, mygoParams);

    // Filter visible hotels (keep onRequest and unavailable hotels)
    const visibleHotels = filterVisibleHotels(searchResult.hotels);

    // BREAKING CHANGE: Do NOT return token to client
    // Token is kept server-side only for booking creation
    const response = {
      rawCount: searchResult.hotels.length,
      visibleCount: visibleHotels.length,
      hotels: visibleHotels,
    };

    // Cache the token-free response
    await setCache(supabase, cacheKey, response, CACHE_TTL_SECONDS);

    return jsonResponse(response, 200, origin);
  } catch (error) {
    console.error("Search error:", error);

    // Format error response
    const errorResponse = formatError(error);
    const statusCode = error instanceof ValidationError ? 400
      : error instanceof ExternalServiceError ? 502
      : 500;

    return jsonResponse(errorResponse, statusCode, origin);
  }
});
