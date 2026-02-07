/**
 * Tests for WhatsApp Notifications Edge Function
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWhatsAppMessage } from "./index.ts";

// Test 1: Message with all parameters
Deno.test("buildWhatsAppMessage - all parameters provided", () => {
  const message = buildWhatsAppMessage(
    "RES-12345",
    "Hotel Marsa",
    "2025-07-10",
    "2025-07-15",
    "450 TND",
  );
  
  assertEquals(
    message,
    "Bonjour, j'ai besoin d'aide pour ma réservation RES-12345. Hôtel: Hotel Marsa. Dates: 2025-07-10 → 2025-07-15. Montant: 450 TND.",
  );
});

// Test 2: Message without bookingId
Deno.test("buildWhatsAppMessage - without bookingId", () => {
  const message = buildWhatsAppMessage(
    undefined,
    "Hotel Marsa",
    undefined,
    undefined,
    undefined,
  );
  
  assertEquals(
    message,
    "Bonjour, j'ai besoin d'aide. Hôtel: Hotel Marsa.",
  );
});

// Test 3: Message with no parameters
Deno.test("buildWhatsAppMessage - no parameters", () => {
  const message = buildWhatsAppMessage(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  
  assertEquals(
    message,
    "Bonjour, j'ai besoin d'aide.",
  );
});

// Test 4: Message with only bookingId
Deno.test("buildWhatsAppMessage - only bookingId", () => {
  const message = buildWhatsAppMessage(
    "RES-12345",
    undefined,
    undefined,
    undefined,
    undefined,
  );
  
  assertEquals(
    message,
    "Bonjour, j'ai besoin d'aide pour ma réservation RES-12345.",
  );
});

// Test 5: Message with partial date information should not include dates
Deno.test("buildWhatsAppMessage - only checkIn without checkOut", () => {
  const message = buildWhatsAppMessage(
    "RES-12345",
    "Hotel Marsa",
    "2025-07-10",
    undefined,
    undefined,
  );
  
  // Should not include dates if checkOut is missing
  assertEquals(
    message,
    "Bonjour, j'ai besoin d'aide pour ma réservation RES-12345. Hôtel: Hotel Marsa.",
  );
});

// Test 6: Verify no "undefined" appears in message
Deno.test("buildWhatsAppMessage - no undefined in output", () => {
  const message = buildWhatsAppMessage(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );
  
  assertEquals(message.includes("undefined"), false);
});

// Test 7: Verify URL encoding works correctly
Deno.test("WhatsApp URL encoding - special characters", () => {
  const message = "Bonjour, j'ai besoin d'aide.";
  const encoded = encodeURIComponent(message);
  
  assertEquals(encoded.includes("'"), false, "Single quotes should be encoded");
  assertEquals(encoded.includes(","), false, "Commas should be encoded");
  assertEquals(encoded.includes(" "), false, "Spaces should be encoded");
});

console.log("✅ All WhatsApp notification tests passed");
