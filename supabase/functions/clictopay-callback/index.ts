import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

const signPayload = async (payload: string, secret: string) => {
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

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clictopaySecret = Deno.env.get("CLICTOPAY_SECRET");
  if (!supabaseUrl || !supabaseKey || !clictopaySecret) {
    return jsonResponse({ error: "Configuration missing" }, 500);
  }

  let payload: {
    reference?: string;
    status?: string;
    signature?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const reference = payload.reference?.trim();
  const status = payload.status?.trim();
  const signature = payload.signature?.trim();
  if (!reference || !status || !signature) {
    return jsonResponse(
      { error: "Missing reference, status, or signature" },
      400,
    );
  }

  const expectedSignature = await signPayload(
    `${reference}:${status}`,
    clictopaySecret,
  );
  if (!timingSafeEqual(expectedSignature, signature.toLowerCase())) {
    return jsonResponse({ error: "Invalid signature" }, 403);
  }

  const normalizedStatus = status.toLowerCase();
  const paymentStatus = ["paid", "success", "succeeded"].includes(
      normalizedStatus,
    )
    ? "paid"
    : "failed";
  const bookingStatus = paymentStatus === "paid" ? "confirmed" : "failed";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .update({ status: paymentStatus })
    .eq("reference", reference)
    .select("booking_id")
    .maybeSingle();

  if (paymentError) {
    return jsonResponse({ error: paymentError.message }, 400);
  }

  const bookingId = paymentData?.booking_id;
  if (!bookingId) {
    return jsonResponse({ error: "Payment not found" }, 404);
  }

  const { error: bookingError } = await supabase
    .from("bookings")
    .update({ status: bookingStatus })
    .eq("id", bookingId);

  if (bookingError) {
    return jsonResponse({ error: bookingError.message }, 400);
  }

  return jsonResponse({ success: true }, 200);
});
