/**
 * Tests for MyGo Client XML Parsing Robustness
 * 
 * These tests verify that XML parsing handles edge cases like:
 * - UTF-8 BOM characters
 * - Null characters
 * - Invalid XML responses (HTML errors, etc.)
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseListCityResponse,
  parseListHotelResponse,
  parseHotelSearchResponse,
  parseBookingCreationResponse,
} from "./mygoClient.ts";

// Test 1: Parse valid XML with UTF-8 BOM
Deno.test("parseListCityResponse should handle UTF-8 BOM", () => {
  const xmlWithBOM = '\uFEFF<?xml version="1.0" encoding="utf-8"?>' +
    '<Root><ListCity><City><Id>1</Id><Name>Tunis</Name></City></ListCity></Root>';
  
  const cities = parseListCityResponse(xmlWithBOM);
  assertEquals(cities.length, 1);
  assertEquals(cities[0].name, "Tunis");
});

// Test 2: Parse valid XML with null characters
Deno.test("parseListCityResponse should handle null characters", () => {
  const xmlWithNull = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Root><ListCity><City><Id>1</Id>\u0000<Name>Tunis</Name>\u0000</City></ListCity></Root>';
  
  const cities = parseListCityResponse(xmlWithNull);
  assertEquals(cities.length, 1);
  assertEquals(cities[0].name, "Tunis");
});

// Test 3: Parse valid XML without issues
Deno.test("parseListCityResponse should parse clean XML", () => {
  const validXml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Root><ListCity>' +
    '<City><Id>1</Id><Name>Tunis</Name><Region>Nord</Region></City>' +
    '<City><Id>2</Id><Name>Sousse</Name></City>' +
    '</ListCity></Root>';
  
  const cities = parseListCityResponse(validXml);
  assertEquals(cities.length, 2);
  assertEquals(cities[0].id, 1);
  assertEquals(cities[0].name, "Tunis");
  assertEquals(cities[0].region, "Nord");
  assertEquals(cities[1].id, 2);
  assertEquals(cities[1].name, "Sousse");
});

// Test 4: Reject non-XML response (HTML error)
Deno.test("parseListCityResponse should reject HTML error response", () => {
  const htmlError = '<!DOCTYPE html><html><head><title>Error</title></head>' +
    '<body><h1>500 Internal Server Error</h1></body></html>';
  
  assertThrows(
    () => parseListCityResponse(htmlError),
    Error,
    "Expected XML but got",
  );
});

// Test 5: Reject plain text response
Deno.test("parseListCityResponse should reject plain text", () => {
  const plainText = "Error: Service unavailable";
  
  assertThrows(
    () => parseListCityResponse(plainText),
    Error,
    "Expected XML but got",
  );
});

// Test 6: Reject JSON response
Deno.test("parseListCityResponse should reject JSON", () => {
  const jsonResponse = '{"error": "Invalid request"}';
  
  assertThrows(
    () => parseListCityResponse(jsonResponse),
    Error,
    "Expected XML but got",
  );
});

// Test 7: Parse ListHotel response with BOM
Deno.test("parseListHotelResponse should handle UTF-8 BOM", () => {
  const xmlWithBOM = '\uFEFF<?xml version="1.0" encoding="utf-8"?>' +
    '<Root><ListHotel>' +
    '<Hotel><Id>101</Id><Name>Hotel Example</Name><CityId>1</CityId></Hotel>' +
    '</ListHotel></Root>';
  
  const hotels = parseListHotelResponse(xmlWithBOM);
  assertEquals(hotels.length, 1);
  assertEquals(hotels[0].name, "Hotel Example");
});

// Test 8: Parse HotelSearch response with null characters
Deno.test("parseHotelSearchResponse should handle null characters", () => {
  const xmlWithNull = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Root>\u0000<Token>abc123</Token>' +
    '<Hotels><Hotel><Id>101</Id><Name>Hotel Test</Name><Available>true</Available></Hotel></Hotels>' +
    '</Root>';
  
  const result = parseHotelSearchResponse(xmlWithNull);
  assertEquals(result.token, "abc123");
  assertEquals(result.hotels.length, 1);
});

// Test 9: Parse BookingCreation response with BOM and nulls
Deno.test("parseBookingCreationResponse should handle BOM and null characters", () => {
  const xmlWithBOMAndNull = '\uFEFF<?xml version="1.0" encoding="utf-8"?>' +
    '<Root><BookingId>12345</BookingId>\u0000<State>confirmed</State><TotalPrice>500.50</TotalPrice></Root>';
  
  const result = parseBookingCreationResponse(xmlWithBOMAndNull);
  assertEquals(result.bookingId, 12345);
  assertEquals(result.state, "confirmed");
  assertEquals(result.totalPrice, 500.50);
});

// Test 10: Reject malformed XML
Deno.test("parseListCityResponse should provide helpful error for malformed XML", () => {
  const malformedXml = '<?xml version="1.0"?><Root><City><Id>1</Name></City></Root>';
  
  assertThrows(
    () => parseListCityResponse(malformedXml),
    Error,
    "Failed to parse ListCity XML",
  );
});

// Test 11: Handle empty response - should throw error
Deno.test("parseListCityResponse should throw error on empty XML response", () => {
  const emptyXml = '<?xml version="1.0" encoding="utf-8"?><Root><ListCity></ListCity></Root>';
  
  assertThrows(
    () => parseListCityResponse(emptyXml),
    Error,
    "No <City> elements found in ListCity response",
  );
});

// Test 12: Handle response without City elements - should throw error
Deno.test("parseListCityResponse should throw error when no City elements", () => {
  const wrongXml = '<?xml version="1.0" encoding="utf-8"?><Root><WrongTag></WrongTag></Root>';
  
  assertThrows(
    () => parseListCityResponse(wrongXml),
    Error,
    "No <City> elements found in ListCity response",
  );
});

// Test 13: Parse Root-wrapped response (without ListCity tag)
Deno.test("parseListCityResponse should handle Root-wrapped response", () => {
  const rootWrappedXml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<Root>' +
    '<City><Id>1</Id><Name>Tunis</Name><Region>Nord</Region></City>' +
    '<City><Id>2</Id><Name>Sousse</Name></City>' +
    '</Root>';
  
  const cities = parseListCityResponse(rootWrappedXml);
  assertEquals(cities.length, 2);
  assertEquals(cities[0].id, 1);
  assertEquals(cities[0].name, "Tunis");
  assertEquals(cities[0].region, "Nord");
  assertEquals(cities[1].id, 2);
  assertEquals(cities[1].name, "Sousse");
});

console.log("✅ All MyGo Client XML parsing tests passed");
