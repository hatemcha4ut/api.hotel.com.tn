import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createBooking,
  type MyGoCredential,
  type MyGoBookingParams,
} from "../_shared/lib/mygoClient.ts";

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

// Hash token for secure storage (never store plain token)
const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

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

  // Parse request body
  let payload: {
    token?: string;
    preBooking?: boolean;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    roomSelections?: Array<{
      hotelId: number;
      roomId: number;
    }>;
  };

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  // Validate required fields
  if (!payload.token || typeof payload.token !== "string") {
    return jsonResponse(
      { error: "token is required (from search-hotels)" },
      400,
      allowedOrigin,
    );
  }

  if (!payload.customerName || typeof payload.customerName !== "string") {
    return jsonResponse(
      { error: "customerName is required" },
      400,
      allowedOrigin,
    );
  }

  if (!payload.customerEmail || typeof payload.customerEmail !== "string") {
    return jsonResponse(
      { error: "customerEmail is required" },
      400,
      allowedOrigin,
    );
  }

  if (!payload.customerPhone || typeof payload.customerPhone !== "string") {
    return jsonResponse(
      { error: "customerPhone is required" },
      400,
      allowedOrigin,
    );
  }

  if (
    !Array.isArray(payload.roomSelections) ||
    payload.roomSelections.length === 0
  ) {
    return jsonResponse(
      { error: "roomSelections array is required (at least 1 room)" },
      400,
      allowedOrigin,
    );
  }

  // Validate room selections
  for (const selection of payload.roomSelections) {
    if (
      !selection ||
      typeof selection.hotelId !== "number" ||
      typeof selection.roomId !== "number"
    ) {
      return jsonResponse(
        { error: "Each roomSelection must have hotelId and roomId (numbers)" },
        400,
        allowedOrigin,
      );
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Default to preBooking=true (recommended)
  const preBooking = payload.preBooking ?? true;

  const bookingParams: MyGoBookingParams = {
    token: payload.token,
    preBooking,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    customerPhone: payload.customerPhone,
    roomSelections: payload.roomSelections,
  };

  try {
    // Call MyGo BookingCreation API
    const credential = getMyGoCredential();
    const myGoResponse = await createBooking(credential, bookingParams);

    // Hash token for storage (never store plain token)
    const tokenHash = await hashToken(payload.token);

    // Store booking record in mygo_bookings table
    const { data: bookingRecord, error: dbError } = await supabase
      .from("mygo_bookings")
      .insert({
        prebooking: preBooking,
        token_hash: tokenHash,
        booking_id: myGoResponse.bookingId ?? null,
        state: myGoResponse.state ?? null,
        total_price: myGoResponse.totalPrice ?? null,
        request_json: {
          customerName: payload.customerName,
          customerEmail: payload.customerEmail,
          customerPhone: payload.customerPhone,
          roomSelections: payload.roomSelections,
          preBooking,
        },
        response_json: myGoResponse,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Failed to store booking record:", dbError);
      // Still return success from MyGo, but log the error
      return jsonResponse(
        {
          ...myGoResponse,
          warning: "Booking created but failed to store in database",
        },
        200,
        allowedOrigin,
      );
    }

    return jsonResponse(
      {
        ...myGoResponse,
        recordId: bookingRecord.id,
      },
      200,
      allowedOrigin,
    );
  } catch (error) {
    console.error("Booking error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Booking creation failed",
      },
      502,
      allowedOrigin,
    );
  }
});
