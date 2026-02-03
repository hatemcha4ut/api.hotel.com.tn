import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const allowedOrigins = new Set([
  "https://hotel.com.tn",
  "https://admin.hotel.com.tn",
]);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
});

const parseJwtClaims = (token: string) => {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("JWT payload missing");
  }
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const json = atob(padded);
  return JSON.parse(json) as Record<string, unknown>;
};

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
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : undefined,
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : undefined,
    });
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401, allowedOrigin);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  let claims: Record<string, unknown>;
  try {
    claims = parseJwtClaims(token);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid token" },
      401,
      allowedOrigin,
    );
  }

  let payload: {
    booking?: Record<string, unknown>;
    booking_rooms?: Record<string, unknown>[];
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  if (
    !payload.booking ||
    typeof payload.booking !== "object" ||
    Array.isArray(payload.booking) ||
    !Array.isArray(payload.booking_rooms)
  ) {
    return jsonResponse({ error: "Invalid booking payload" }, 400, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    return jsonResponse({ error: userError.message }, 401, allowedOrigin);
  }

  const isAnonymous =
    claims.is_anonymous === true ||
    claims.is_anonymous === "true" ||
    userData?.user?.is_anonymous === true;
  const bookingMode = isAnonymous ? "SANS_COMPTE" : "AVEC_COMPTE";

  const { data: bookingData, error: bookingError } = await supabase
    .from("booking")
    .insert({ ...payload.booking, booking_mode: bookingMode })
    .select()
    .single();

  if (bookingError) {
    return jsonResponse({ error: bookingError.message }, 400, allowedOrigin);
  }

  const bookingId = (bookingData as { id?: string })?.id;
  const bookingRooms = payload.booking_rooms.map((room) => ({
    ...room,
    booking_id: bookingId,
  }));

  const bookingRoomsResult = bookingRooms.length
    ? await supabase.from("booking_rooms").insert(bookingRooms).select()
    : { data: [], error: null };

  if (bookingRoomsResult.error) {
    return jsonResponse(
      { error: bookingRoomsResult.error.message },
      400,
      allowedOrigin,
    );
  }

  return jsonResponse(
    { booking: bookingData, booking_rooms: bookingRoomsResult.data },
    200,
    allowedOrigin,
  );
});
