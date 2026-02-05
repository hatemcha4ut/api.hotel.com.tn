import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// CORS

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

// Helpers communs

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

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const SUCCESS_STATUSES = ["paid", "success", "succeeded"];
const POSTGREST_NOT_FOUND_CODE = "PGRST116";

const timingSafeEqual = (left: string, right: string) => {
  const leftLength = left.length;
  const rightLength = right.length;
  const maxLength = Math.max(leftLength, rightLength);
  let mismatchBits = leftLength ^ rightLength;
  for (let i = 0; i < maxLength; i += 1) {
    const leftChar = i < leftLength ? left.charCodeAt(i) : 0;
    const rightChar = i < rightLength ? right.charCodeAt(i) : 0;
    mismatchBits |= leftChar ^ rightChar;
  }
  return mismatchBits === 0;
};

const generateHmacSignature = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(new Uint8Array(signature));
};

// Handler principal

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clictopaySecret = Deno.env.get("CLICTOPAY_SECRET");
  if (!supabaseUrl || !supabaseKey || !clictopaySecret) {
    return jsonResponse(
      {
        error:
          "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLICTOPAY_SECRET",
      },
      500,
      allowedOrigin,
    );
  }

  let payload: {
    reference?: string;
    status?: string;
    signature?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const reference = payload.reference?.trim();
  const status = payload.status?.trim();
  const signature = payload.signature?.trim();
  if (!reference || !status || !signature) {
    return jsonResponse(
      { error: "Missing reference, status, or signature" },
      400,
      allowedOrigin,
    );
  }

  const signatureLower = signature.toLowerCase();
  const expectedSignature = await generateHmacSignature(
    `${reference}:${status}`,
    clictopaySecret,
  );
  const signatureMatches = timingSafeEqual(expectedSignature, signatureLower);
  if (!signatureMatches) {
    return jsonResponse({ error: "Invalid signature" }, 403, allowedOrigin);
  }

  const normalizedStatus = status.toLowerCase();
  const paymentStatus = SUCCESS_STATUSES.includes(normalizedStatus)
    ? "paid"
    : "failed";
  const bookingStatus = paymentStatus === "paid" ? "confirmed" : "failed";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data: paymentRecord, error: paymentSelectError } = await supabase
    .from("payments")
    .select("id, booking_id, status")
    .eq("reference", reference)
    .single();

  if (paymentSelectError) {
    const notFound = paymentSelectError.code === POSTGREST_NOT_FOUND_CODE;
    return jsonResponse(
      { error: paymentSelectError.message },
      notFound ? 404 : 500,
      allowedOrigin,
    );
  }

  const bookingId = paymentRecord.booking_id;
  if (!bookingId) {
    return jsonResponse(
      { error: "Missing booking_id for payment" },
      404,
      allowedOrigin,
    );
  }

  const previousPaymentStatus = paymentRecord.status;
  const { data: bookingRecord, error: bookingSelectError } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (bookingSelectError) {
    const notFound = bookingSelectError.code === POSTGREST_NOT_FOUND_CODE;
    return jsonResponse(
      { error: bookingSelectError.message },
      notFound ? 404 : 500,
      allowedOrigin,
    );
  }

  const { error: paymentError } = await supabase
    .from("payments")
    .update({ status: paymentStatus })
    .eq("id", paymentRecord.id);

  if (paymentError) {
    const notFound = paymentError.code === POSTGREST_NOT_FOUND_CODE;
    return jsonResponse(
      { error: paymentError.message },
      notFound ? 404 : 500,
      allowedOrigin,
    );
  }

  const { error: bookingError } = await supabase
    .from("bookings")
    .update({ status: bookingStatus })
    .eq("id", bookingRecord.id);

  if (bookingError) {
    if (previousPaymentStatus !== null && previousPaymentStatus !== undefined) {
      const { error: rollbackError } = await supabase
        .from("payments")
        .update({ status: previousPaymentStatus })
        .eq("id", paymentRecord.id);
      if (rollbackError) {
        return jsonResponse(
          {
            error:
              `Booking update failed (${bookingError.message}); rollback failed: ${rollbackError.message}`,
          },
          500,
          allowedOrigin,
        );
      }
    }
    const notFound = bookingError.code === POSTGREST_NOT_FOUND_CODE;
    return jsonResponse(
      { error: bookingError.message },
      notFound ? 404 : 500,
      allowedOrigin,
    );
  }

  return jsonResponse({ success: true }, 200, allowedOrigin);
});
