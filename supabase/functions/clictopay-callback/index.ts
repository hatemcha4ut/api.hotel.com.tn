import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const allowedOrigins = new Set([
  "https://www.hotel.com.tn",
  "https://admin.hotel.com.tn",
]);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
});

const jsonResponse = (
  body: Record<string, unknown>,
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

serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "";

  if (origin && !allowedOrigin) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
  }

  return jsonResponse({ status: "received" }, 200, allowedOrigin);
});
