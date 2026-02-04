import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  searchHotels,
  filterBookableHotels,
  type MyGoCredential,
  type MyGoSearchParams,
} from "../_shared/lib/mygoClient.ts";

// Validation constants
const MAX_ROOMS = 10;
const MAX_ADULTS_PER_ROOM = 10;
const MAX_CHILDREN_PER_ROOM = 10;
const MAX_CHILD_AGE = 17;
const CACHE_TTL_SECONDS = 120;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_REQUESTS = 60;

// CORS configuration - only allow specific origins
const allowedOrigins = new Set([
  "https://www.hotel.com.tn",
  "http://localhost:5173",
]);

const corsHeaders = (origin: string) =>
  allowedOrigins.has(origin)
    ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Vary": "Origin",
    }
    : {};

const jsonResponse = (
  body: Record<string, unknown> | unknown[],
  status: number,
  origin?: string,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });

// Hash IP for rate limiting key
const hashString = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Get client IP from request
const getClientIp = (request: Request): string => {
  // Try various headers that might contain the real IP
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp;
  }

  // Fallback to a generic identifier
  return "unknown";
};

// Rate limiting check
const checkRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  clientIp: string,
  windowMinutes: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number }> => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

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
    return { allowed: false, remaining: 0 };
  }

  // Increment count
  await supabase
    .from("rate_limits")
    .update({ count: existing.count + 1 })
    .eq("key", key);

  return { allowed: true, remaining: maxRequests - existing.count - 1 };
};

// Cache helpers
const getCacheKey = (params: MyGoSearchParams): string => {
  return JSON.stringify({
    cityId: params.cityId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    rooms: params.rooms,
    currency: params.currency,
  });
};

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

const setCache = async (
  supabase: ReturnType<typeof createClient>,
  cacheKey: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await supabase.from("search_cache").upsert({
    key: cacheKey,
    expires_at: expiresAt.toISOString(),
    response_json: value,
  });
};

// Validate search parameters
const validateSearchParams = (params: {
  checkIn?: string;
  checkOut?: string;
  cityId?: number;
  rooms?: unknown[];
}): string | null => {
  if (!params.checkIn || typeof params.checkIn !== "string") {
    return "checkIn is required (YYYY-MM-DD format)";
  }

  if (!params.checkOut || typeof params.checkOut !== "string") {
    return "checkOut is required (YYYY-MM-DD format)";
  }

  if (!params.cityId || typeof params.cityId !== "number") {
    return "cityId is required (number)";
  }

  if (!Array.isArray(params.rooms) || params.rooms.length === 0) {
    return "rooms array is required (at least 1 room)";
  }

  if (params.rooms.length > MAX_ROOMS) {
    return `Maximum ${MAX_ROOMS} rooms allowed`;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(params.checkIn)) {
    return "checkIn must be in YYYY-MM-DD format";
  }

  if (!dateRegex.test(params.checkOut)) {
    return "checkOut must be in YYYY-MM-DD format";
  }

  // Validate dates are valid
  const checkInDate = new Date(params.checkIn);
  const checkOutDate = new Date(params.checkOut);

  if (isNaN(checkInDate.getTime())) {
    return "checkIn is not a valid date";
  }

  if (isNaN(checkOutDate.getTime())) {
    return "checkOut is not a valid date";
  }

  if (checkOutDate <= checkInDate) {
    return "checkOut must be after checkIn";
  }

  // Validate rooms
  for (const room of params.rooms) {
    if (!room || typeof room !== "object") {
      return "Each room must be an object";
    }

    const r = room as { adults?: number; childrenAges?: unknown };

    if (!r.adults || typeof r.adults !== "number" || r.adults < 1 || r.adults > MAX_ADULTS_PER_ROOM) {
      return `Each room must have adults (1-${MAX_ADULTS_PER_ROOM})`;
    }

    if (r.childrenAges) {
      if (!Array.isArray(r.childrenAges)) {
        return "childrenAges must be an array";
      }

      if (r.childrenAges.length > MAX_CHILDREN_PER_ROOM) {
        return `Maximum ${MAX_CHILDREN_PER_ROOM} children per room`;
      }

      for (const age of r.childrenAges) {
        if (typeof age !== "number" || age < 0 || age > MAX_CHILD_AGE) {
          return `Child ages must be numbers between 0 and ${MAX_CHILD_AGE}`;
        }
      }
    }
  }

  return null;
};

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
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "";

  if (origin && !allowedOrigin) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
      allowedOrigin,
    );
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Rate limiting
  const clientIp = getClientIp(request);
  let rateLimitResult;
  try {
    rateLimitResult = await checkRateLimit(supabase, clientIp, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS);
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Allow request but log the error - don't block on rate limit DB issues
    rateLimitResult = { allowed: true, remaining: -1 };
  }

  if (!rateLimitResult.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded. Please try again later." },
      429,
      allowedOrigin,
    );
  }

  // Parse request body
  let payload: {
    checkIn?: string;
    checkOut?: string;
    cityId?: number;
    currency?: "TND" | "EUR" | "USD";
    onlyAvailable?: boolean;
    rooms?: Array<{ adults: number; childrenAges?: number[] }>;
  };

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  // Validate parameters
  const validationError = validateSearchParams(payload);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400, allowedOrigin);
  }

  const searchParams: MyGoSearchParams = {
    cityId: payload.cityId!,
    checkIn: payload.checkIn!,
    checkOut: payload.checkOut!,
    rooms: payload.rooms!,
    currency: payload.currency,
    onlyAvailable: payload.onlyAvailable ?? true,
  };

  // Check cache
  const cacheKey = getCacheKey(searchParams);
  const cached = await getFromCache(supabase, cacheKey);

  if (cached) {
    return jsonResponse(cached as Record<string, unknown>, 200, allowedOrigin);
  }

  // Call MyGo API
  try {
    const credential = getMyGoCredential();
    const searchResult = await searchHotels(credential, searchParams);

    // Filter out non-bookable hotels (Available=false or OnRequest=true rooms)
    const bookableHotels = filterBookableHotels(searchResult.hotels);

    const response = {
      token: searchResult.token,
      hotels: bookableHotels,
    };

    // Cache the response
    await setCache(supabase, cacheKey, response, CACHE_TTL_SECONDS);

    return jsonResponse(response, 200, allowedOrigin);
  } catch (error) {
    console.error("Search error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Search failed",
      },
      502,
      allowedOrigin,
    );
  }
});
