/**
 * Unified CORS middleware
 * 
 * Security: Only allows specific origins to prevent CSRF and unauthorized access
 */

// Allowlist of permitted origins
const ALLOWED_ORIGINS = new Set([
  "https://www.hotel.com.tn",
  "http://localhost:5173",
]);

/**
 * Get CORS headers for a given origin
 * Returns empty object if origin is not allowed
 */
export const getCorsHeaders = (origin: string): Record<string, string> => {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

/**
 * Check if an origin is allowed
 */
export const isOriginAllowed = (origin: string): boolean => {
  return ALLOWED_ORIGINS.has(origin);
};

/**
 * Handle OPTIONS preflight request
 */
export const handleOptions = (origin: string): Response => {
  const headers = getCorsHeaders(origin);
  return new Response(null, {
    status: 204,
    headers,
  });
};

/**
 * Create a JSON response with CORS headers
 */
export const jsonResponse = (
  body: Record<string, unknown> | unknown[],
  status: number,
  origin?: string,
): Response => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin) {
    Object.assign(headers, getCorsHeaders(origin));
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
};
