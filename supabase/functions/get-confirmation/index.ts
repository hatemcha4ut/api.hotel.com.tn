import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

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

  let payload: { confirmation_token?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const confirmationToken = normalizeString(payload.confirmation_token);
  if (!confirmationToken) {
    return jsonResponse({ error: "Invalid confirmation token" }, 400, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("bookings")
    .select(
      [
        "status",
        "hotel_name",
        "check_in",
        "check_out",
        "total_amount",
        "customer_first_name",
        "customer_last_name",
      ].join(","),
    )
    .eq("confirmation_token", confirmationToken)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 400, allowedOrigin);
  }

  if (!data) {
    return jsonResponse({ error: "Booking not found" }, 404, allowedOrigin);
  }

  const firstName = normalizeString(data.customer_first_name);
  const lastName = normalizeString(data.customer_last_name);
  const clientName = [firstName, lastName].filter((value) =>
    value.length > 0
  ).join(" ") || undefined;

  return jsonResponse(
    {
      status: data.status,
      hotel_name: data.hotel_name,
      dates: {
        check_in: data.check_in,
        check_out: data.check_out,
      },
      total_amount: data.total_amount,
      client_name: clientName ?? null,
    },
    200,
    allowedOrigin,
  );
});
