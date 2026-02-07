/**
 * Tests for WhatsApp Click-to-Chat Edge Function
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWhatsAppMessage } from "./index.ts";

Deno.test("buildWhatsAppMessage - with all parameters", () => {
  const result = buildWhatsAppMessage(
    "RES-12345",
    "client@example.com",
    "+21651613888",
  );
  
  assertEquals(
    result,
    "Bonjour, je vous contacte au sujet de la réservation #RES-12345.\nEmail: client@example.com\nWhatsApp client: +21651613888",
  );
});

Deno.test("buildWhatsAppMessage - with bookingId only", () => {
  const result = buildWhatsAppMessage("RES-67890");
  
  assertEquals(
    result,
    "Bonjour, je vous contacte au sujet de la réservation #RES-67890.\nEmail: Non renseigné\nWhatsApp client: Non renseigné",
  );
});

Deno.test("buildWhatsAppMessage - with bookingId and email", () => {
  const result = buildWhatsAppMessage("RES-11111", "test@test.com");
  
  assertEquals(
    result,
    "Bonjour, je vous contacte au sujet de la réservation #RES-11111.\nEmail: test@test.com\nWhatsApp client: Non renseigné",
  );
});

Deno.test("buildWhatsAppMessage - with bookingId and WhatsApp", () => {
  const result = buildWhatsAppMessage("RES-22222", undefined, "+33612345678");
  
  assertEquals(
    result,
    "Bonjour, je vous contacte au sujet de la réservation #RES-22222.\nEmail: Non renseigné\nWhatsApp client: +33612345678",
  );
});

Deno.test("URL encoding check", () => {
  const message = buildWhatsAppMessage("RES-12345", "test@example.com", "+21651613888");
  const encoded = encodeURIComponent(message);
  
  // Verify that special characters are properly encoded
  assertEquals(encoded.includes("@"), false);
  assertEquals(encoded.includes("\n"), false);
  assertEquals(encoded.includes(" "), false);
});
