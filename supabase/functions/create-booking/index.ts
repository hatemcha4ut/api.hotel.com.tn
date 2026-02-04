import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callBookingCreation,
  callHotelSearch,
  hashToken,
  type HotelSearchParams,
} from "../_shared/mygo-soap.ts";

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

const parseJwtHeader = (token: string) => {
  const [header] = token.split(".");
  if (!header) {
    throw new Error("JWT header missing");
  }
  const base64 = header.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const json = atob(padded);
  return JSON.parse(json) as { alg?: string };
};

const verifyJwtClaims = async (
  token: string,
  secret: string,
  algorithm: "HS256",
) => (await verify(token, secret, algorithm)) as Record<string, unknown>;

// Normalize string values from payload
const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

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

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!supabaseUrl || !supabaseKey || !jwtSecret) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
      allowedOrigin,
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const header = parseJwtHeader(token);
    if (header.alg !== "HS256") {
      return jsonResponse(
        { error: "Unsupported JWT algorithm" },
        401,
        allowedOrigin,
      );
    }
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid token" },
      401,
      allowedOrigin,
    );
  }
  const algorithm = "HS256";
  let claims: Record<string, unknown>;
  try {
    claims = await verifyJwtClaims(token, jwtSecret, algorithm);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid token" },
      401,
      allowedOrigin,
    );
  }

  let payload: {
    searchParams?: {
      cityId?: string | number;
      checkIn?: string;
      checkOut?: string;
      occupancy?: string | number;
    };
    booking?: Record<string, unknown>;
    booking_rooms?: Record<string, unknown>[];
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  // Validate searchParams
  if (
    !payload.searchParams ||
    typeof payload.searchParams !== "object" ||
    Array.isArray(payload.searchParams)
  ) {
    return jsonResponse(
      { error: "Missing or invalid searchParams" },
      400,
      allowedOrigin,
    );
  }

  const cityId = normalizeString(payload.searchParams.cityId);
  const checkIn = normalizeString(payload.searchParams.checkIn);
  const checkOut = normalizeString(payload.searchParams.checkOut);
  const occupancy = normalizeString(payload.searchParams.occupancy);

  if (!cityId || !checkIn || !checkOut || !occupancy) {
    return jsonResponse(
      { error: "Missing required search parameters (cityId, checkIn, checkOut, occupancy)" },
      400,
      allowedOrigin,
    );
  }

  if (
    !payload.booking ||
    typeof payload.booking !== "object" ||
    Array.isArray(payload.booking) ||
    !Array.isArray(payload.booking_rooms) ||
    payload.booking_rooms.some(
      (room) => !room || typeof room !== "object" || Array.isArray(room),
    )
  ) {
    return jsonResponse({ error: "Invalid booking payload" }, 400, allowedOrigin);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const claimAnonymous = claims.is_anonymous;
  const isAnonymous = claimAnonymous === true;
  const bookingMode = isAnonymous ? "SANS_COMPTE" : "AVEC_COMPTE";

  // Step 1: Call MyGo HotelSearch to get a fresh token
  // This is required for the BookingCreation call
  const searchParams: HotelSearchParams = {
    cityId,
    checkIn,
    checkOut,
    occupancy,
  };

  const searchResult = await callHotelSearch(searchParams);
  if (searchResult.error) {
    return jsonResponse(
      { error: `Hotel search failed: ${searchResult.error}` },
      502,
      allowedOrigin,
    );
  }

  if (!searchResult.result?.token) {
    return jsonResponse(
      { error: "MyGo token not received from search" },
      502,
      allowedOrigin,
    );
  }

  const mygoToken = searchResult.result.token;

  // Step 2: Call MyGo BookingCreation with PreBooking=true
  // This validates the booking with MyGo before we save to our database
  const bookingResult = await callBookingCreation(mygoToken, payload.booking);
  if (bookingResult.error) {
    return jsonResponse(
      { error: `Booking creation failed: ${bookingResult.error}` },
      502,
      allowedOrigin,
    );
  }

  // Step 3: Hash the token for secure storage (never store plain token)
  // We may need to reference this booking with MyGo later
  const tokenHash = await hashToken(mygoToken);

  const bookingPayload = Object.fromEntries(
    Object.entries(payload.booking).filter(
      ([key]) => key !== "booking_mode" && key !== "id",
    ),
  );

  // Add the MyGo booking reference and token hash to our database record
  const bookingWithMyGoData = {
    ...bookingPayload,
    booking_mode: bookingMode,
    mygo_token_hash: tokenHash,
    mygo_booking_reference: bookingResult.bookingReference,
  };

  const { data: bookingData, error: bookingError } = await supabase
    .from("booking")
    .insert(bookingWithMyGoData)
    .select()
    .single();

  if (bookingError) {
    return jsonResponse({ error: bookingError.message }, 400, allowedOrigin);
  }

  const bookingId = (bookingData as { id?: string | number })?.id;
  if (
    bookingId === null ||
    bookingId === undefined ||
    (typeof bookingId !== "string" && typeof bookingId !== "number")
  ) {
    return jsonResponse(
      { error: "Booking ID missing" },
      500,
      allowedOrigin,
    );
  }
  const bookingRooms = payload.booking_rooms.map((room) => {
    const roomPayload = Object.fromEntries(
      Object.entries(room).filter(
        ([key]) => key !== "booking_id" && key !== "id",
      ),
    );
    return { ...roomPayload, booking_id: bookingId };
  });

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
