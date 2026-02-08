import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleOptions } from "../_shared/cors.ts";

/**
 * Version endpoint - returns build metadata
 * 
 * This is a public endpoint (no authentication required) that returns
 * information about the deployed version for audit purposes.
 * 
 * Supports GET method (unlike most other Edge Functions which use POST)
 */

serve(async (req: Request) => {
  // Extract origin for CORS
  const origin = req.headers.get("origin") || "";

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return handleOptions(origin);
  }

  // Only allow GET method
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET." }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
        },
      }
    );
  }

  // Get version info from environment variables
  // These are set by the deploy workflow via `supabase secrets set`
  const sha = Deno.env.get("GITHUB_SHA") || "unknown";
  const builtAt = Deno.env.get("BUILT_AT") || new Date().toISOString();
  const env = Deno.env.get("ENVIRONMENT") || "production";

  const versionInfo = {
    sha,
    builtAt,
    env,
  };

  return new Response(
    JSON.stringify(versionInfo),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(origin),
      },
    }
  );
});
