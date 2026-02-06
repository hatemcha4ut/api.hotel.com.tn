/**
 * Tests for MyGo Client XML Parsing Robustness
 * 
 * These tests verify that XML parsing handles edge cases like:
 * - UTF-8 BOM characters
 * - Null characters
 * - Invalid XML responses (HTML errors, etc.)
 */

import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildListCityPayload,
  listCities,
  listHotels,
  searchHotels,
  createBooking,
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

Deno.test("buildListCityPayload should format credentials for JSON", () => {
  const payload = buildListCityPayload({ login: "user", password: "pass" });
  assertEquals(payload, {
    Credential: {
      Login: "user",
      Password: "pass",
    },
  });
});

Deno.test("listCities should map JSON ListCity response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        ListCity: [
          { Id: 1, Name: "Tunis", Region: "Nord" },
          { Id: "2", Name: "Sousse" },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  try {
    const cities = await listCities({ login: "user", password: "pass" });
    assertEquals(cities, [
      { id: 1, name: "Tunis", region: "Nord" },
      { id: 2, name: "Sousse", region: undefined },
    ]);
    assertEquals(JSON.parse(receivedBody), buildListCityPayload({ login: "user", password: "pass" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("listCities should reject missing ListCity array", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({ error: "missing" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    await assertRejects(
      () => listCities({ login: "user", password: "pass" }),
      Error,
      "No ListCity elements found in ListCity response",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("listHotels should map JSON ListHotel response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        ListHotel: [
          { Id: 101, Name: "Hotel Example", CityId: "2", Star: "5" },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  try {
    const hotels = await listHotels({ login: "user", password: "pass" }, 2);
    assertEquals(hotels, [
      {
        id: 101,
        name: "Hotel Example",
        cityId: 2,
        star: "5",
        categoryTitle: undefined,
        address: undefined,
        longitude: undefined,
        latitude: undefined,
        image: undefined,
        note: undefined,
      },
    ]);
    assertEquals(JSON.parse(receivedBody), {
      Credential: { Login: "user", Password: "pass" },
      CityId: 2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("searchHotels should map JSON HotelSearch response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        Token: "token-123",
        Hotel: [
          {
            Id: "201",
            Name: "Seaside Resort",
            Available: "true",
            CategoryTitle: "Luxury",
            Room: [
              { OnRequest: "false", Price: "150.5", Board: "BB" },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  try {
    const result = await searchHotels(
      { login: "user", password: "pass" },
      {
        cityId: 1,
        checkIn: "2026-03-15",
        checkOut: "2026-03-20",
        rooms: [{ adults: 2, childrenAges: [5, 8] }],
      },
    );
    assertEquals(result.token, "token-123");
    assertEquals(result.hotels, [
      {
        id: 201,
        name: "Seaside Resort",
        available: true,
        rooms: [
          {
            onRequest: false,
            price: 150.5,
            Board: "BB",
          },
        ],
        CategoryTitle: "Luxury",
      },
    ]);
    assertEquals(JSON.parse(receivedBody), {
      Credential: { Login: "user", Password: "pass" },
      CityId: 1,
      CheckIn: "2026-03-15",
      CheckOut: "2026-03-20",
      Currency: "TND",
      OnlyAvailable: true,
      Rooms: [{ Adults: 2, Child: [5, 8] }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createBooking should map JSON BookingCreation response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        BookingId: "12345",
        State: "confirmed",
        TotalPrice: "500.5",
        Reference: "ABC-123",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  try {
    const result = await createBooking(
      { login: "user", password: "pass" },
      {
        token: "token-123",
        preBooking: true,
        customerName: "John Doe",
        customerEmail: "john@example.com",
        customerPhone: "+216123456789",
        roomSelections: [{ hotelId: 10, roomId: 20 }],
      },
    );
    assertEquals(result, {
      bookingId: 12345,
      state: "confirmed",
      totalPrice: 500.5,
      Reference: "ABC-123",
    });
    assertEquals(JSON.parse(receivedBody), {
      Credential: { Login: "user", Password: "pass" },
      Token: "token-123",
      PreBooking: true,
      CustomerName: "John Doe",
      CustomerEmail: "john@example.com",
      CustomerPhone: "+216123456789",
      RoomSelections: [{ HotelId: 10, RoomId: 20 }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log("✅ All MyGo Client tests passed");
