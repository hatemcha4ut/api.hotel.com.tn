/**
 * WhatsApp Click-to-Chat Edge Function
 * 
 * Provides WhatsApp Click-to-Chat URL generation for bookings.
 * This is a free URL-based solution (no WhatsApp Business API required).
 * 
 * Routes:
 * - GET /whatsapp-click-to-chat?action=health
 * - GET /whatsapp-click-to-chat?action=click-to-chat&bookingId=...&guestWhatsApp=...&email=...
 * 
 * Examples:
 * curl "https://<project-ref>.supabase.co/functions/v1/whatsapp-click-to-chat?action=health"
 * curl "https://<project-ref>.supabase.co/functions/v1/whatsapp-click-to-chat?action=click-to-chat&bookingId=RES-12345&guestWhatsApp=%2B21651613888&email=client@example.com"
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const WHATSAPP_HOTEL_NUMBER = "21651613888";

/**
 * Build French message for WhatsApp click-to-chat
 */
export const buildWhatsAppMessage = (
  bookingId: string,
  email?: string,
  guestWhatsApp?: string,
): string => {
  const lines = [
    `Bonjour, je vous contacte au sujet de la réservation #${bookingId}.`,
    `Email: ${email || "Non renseigné"}`,
    `WhatsApp client: ${guestWhatsApp || "Non renseigné"}`,
  ];

  return lines.join("\n");
};

/**
 * Handle health check endpoint
 */
const handleHealth = (): Response => {
  return new Response(
    JSON.stringify({ ok: true, service: "whatsapp-click-to-chat" }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
};

/**
 * Handle click-to-chat URL generation
 */
const handleClickToChat = (url: URL): Response => {
  const bookingId = url.searchParams.get("bookingId");
  const guestWhatsApp = url.searchParams.get("guestWhatsApp") || undefined;
  const email = url.searchParams.get("email") || undefined;

  // Validate required parameters
  if (!bookingId) {
    return new Response(
      JSON.stringify({ error: "bookingId is required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Build the message
  const message = buildWhatsAppMessage(bookingId, email, guestWhatsApp);
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${WHATSAPP_HOTEL_NUMBER}?text=${encodedMessage}`;

  return new Response(
    JSON.stringify({
      url: whatsappUrl,
      bookingId,
      guestWhatsApp,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
};

/**
 * Handle CORS preflight
 */
const handleOptions = (): Response => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
};

serve(async (request) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  // Only GET allowed
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    // Route based on action parameter
    if (action === "health") {
      return handleHealth();
    } else if (action === "click-to-chat") {
      return handleClickToChat(url);
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use 'health' or 'click-to-chat'" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
