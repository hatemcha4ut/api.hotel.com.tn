/**
 * WhatsApp Notifications Edge Function
 * 
 * Provides WhatsApp Click-to-Chat URL generation and health check endpoint.
 * 
 * Curl examples:
 * 
 * # Health check
 * curl "https://<project-ref>.supabase.co/functions/v1/apinotifications-whatsapp/health"
 * 
 * # Click-to-chat with all params
 * curl "https://<project-ref>.supabase.co/functions/v1/apinotifications-whatsapp/click-to-chat?bookingId=RES-12345&hotelName=Hotel%20Marsa&checkIn=2025-07-10&checkOut=2025-07-15&amount=450%20TND"
 * 
 * # Click-to-chat without bookingId
 * curl "https://<project-ref>.supabase.co/functions/v1/apinotifications-whatsapp/click-to-chat?hotelName=Hotel%20Marsa"
 * 
 * # Click-to-chat with no params
 * curl "https://<project-ref>.supabase.co/functions/v1/apinotifications-whatsapp/click-to-chat"
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const WHATSAPP_PHONE = "21651613888";

/**
 * Build French message for WhatsApp based on provided booking parameters
 */
export const buildWhatsAppMessage = (
  bookingId?: string,
  hotelName?: string,
  checkIn?: string,
  checkOut?: string,
  amount?: string,
): string => {
  const parts: string[] = ["Bonjour, j'ai besoin d'aide"];

  if (bookingId) {
    parts.push(`pour ma réservation ${bookingId}`);
  }

  let messageParts = parts.join(" ") + ".";

  if (hotelName) {
    messageParts += ` Hôtel: ${hotelName}.`;
  }

  if (checkIn && checkOut) {
    messageParts += ` Dates: ${checkIn} → ${checkOut}.`;
  }

  if (amount) {
    messageParts += ` Montant: ${amount}.`;
  }

  return messageParts;
};

/**
 * Handle click-to-chat endpoint
 */
const handleClickToChat = (request: Request, origin?: string): Response => {
  const url = new URL(request.url);
  const params = url.searchParams;

  const bookingId = params.get("bookingId") || undefined;
  const hotelName = params.get("hotelName") || undefined;
  const checkIn = params.get("checkIn") || undefined;
  const checkOut = params.get("checkOut") || undefined;
  const amount = params.get("amount") || undefined;

  const message = buildWhatsAppMessage(
    bookingId,
    hotelName,
    checkIn,
    checkOut,
    amount,
  );

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodedMessage}`;

  return jsonResponse({ url: whatsappUrl }, 200, origin);
};

/**
 * Handle health check endpoint
 */
const handleHealth = (origin?: string): Response => {
  return jsonResponse({ ok: true }, 200, origin);
};

serve(async (request) => {
  const origin = request.headers.get("origin") || undefined;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleOptions(origin || "");
  }

  // Only GET allowed
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route based on path
    if (pathname.endsWith("/click-to-chat")) {
      return handleClickToChat(request, origin);
    } else if (pathname.endsWith("/health")) {
      return handleHealth(origin);
    } else {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      500,
      origin,
    );
  }
});
