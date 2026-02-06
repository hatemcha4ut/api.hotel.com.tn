/**
 * Tests for MyGo Client XML Parsing Robustness
 * 
 * These tests verify that XML parsing handles edge cases like:
 * - UTF-8 BOM characters
 * - Null characters
 * - Invalid XML responses (HTML errors, etc.)
 */

import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildBookingCreationPayload,
  buildHotelDetailPayload,
  buildListCityPayload,
  buildListCountryPayload,
  buildListHotelPayload,
  buildHotelSearchPayload,
  createBooking,
  hotelDetail,
  listCities,
  listCountries,
  listHotels,
  parseListCityResponse,
  parseListHotelResponse,
  parseHotelSearchResponse,
  parseBookingCreationResponse,
  searchHotels,
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

Deno.test("listCountries should return JSON ListCountry response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        ListCountry: [{ Id: 1, Name: "Tunisia" }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const countries = await listCountries({ login: "user", password: "pass" });
    assertEquals(countries, [{ Id: 1, Name: "Tunisia" }]);
    assertEquals(
      JSON.parse(receivedBody),
      buildListCountryPayload({ login: "user", password: "pass" }),
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
          {
            Id: 10,
            Name: "Hotel Example",
            CityId: 5,
            Star: 4,
            CategoryTitle: "Deluxe",
            Address: "Main Street",
            Longitude: "10.1",
            Latitude: "11.2",
            Image: "image.png",
            Note: "note",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const hotels = await listHotels({ login: "user", password: "pass" }, 5);
    assertEquals(hotels, [
      {
        id: 10,
        name: "Hotel Example",
        cityId: 5,
        star: "4",
        categoryTitle: "Deluxe",
        address: "Main Street",
        longitude: "10.1",
        latitude: "11.2",
        image: "image.png",
        note: "note",
      },
    ]);
    assertEquals(
      JSON.parse(receivedBody),
      buildListHotelPayload({ login: "user", password: "pass" }, 5),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("hotelDetail should merge credential payload with params", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBody = "";

  globalThis.fetch = async (_input, init) => {
    receivedBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        Hotel: { Id: 77, Name: "Hotel Detail" },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  try {
    const params = { HotelId: 77, Language: "fr" };
    const response = await hotelDetail({ login: "user", password: "pass" }, params);
    assertEquals(response, { Hotel: { Id: 77, Name: "Hotel Detail" } });
    assertEquals(
      JSON.parse(receivedBody),
      buildHotelDetailPayload({ login: "user", password: "pass" }, params),
    );
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
        HotelSearch: [
          {
            Hotel: {
              Id: 101,
              Name: "Hotel Test",
              Category: { Title: "5 étoiles", Star: 5 },
              City: { Id: 10, Name: "Hammamet" },
              Adress: "Main Street",
              Image: "image.png",
              Facilities: [{ Title: "Spa" }],
              Theme: ["Famille"],
              Note: "note",
            },
            Token: "token-xyz",
            Price: {
              Boarding: [
                {
                  Code: "LPD",
                  Name: "Logement Petit Déjeuner",
                  Pax: [
                    {
                      Adult: 2,
                      Child: [3, 8],
                      Rooms: [
                        {
                          Id: 97,
                          Name: "Standard",
                          Price: "642.000",
                          BasePrice: "802.500",
                          PriceWithAffiliateMarkup: "674.100",
                          StopReservation: false,
                          CancellationPolicy: [{ Policy: "test" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
        CountResults: 1,
        ErrorMessage: [],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };

  const params = {
    cityId: 1,
    checkIn: "2025-01-10",
    checkOut: "2025-01-12",
    hotelIds: [101],
    rooms: [{ adults: 2, childrenAges: [5] }],
    currency: "TND" as const,
  };

  try {
    const result = await searchHotels({ login: "user", password: "pass" }, params);
    assertEquals(result.token, "token-xyz");
    assertEquals(result.hotels.length, 1);
    assertEquals(result.hotels[0].available, true);
    assertEquals(result.hotels[0].cityId, 10);
    assertEquals(result.hotels[0].cityName, "Hammamet");
    assertEquals(result.hotels[0].categoryTitle, "5 étoiles");
    assertEquals(result.hotels[0].star, 5);
    assertEquals(result.hotels[0].address, "Main Street");
    assertEquals(result.hotels[0].image, "image.png");
    assertEquals(result.hotels[0].themes, ["Famille"]);
    assertEquals(result.hotels[0].facilities, [{ Title: "Spa" }]);
    assertEquals(result.hotels[0].note, "note");
    assertEquals(result.hotels[0].rooms[0].onRequest, false);
    assertEquals(result.hotels[0].rooms[0].price, 642);
    assertEquals(result.hotels[0].rooms[0].roomId, 97);
    assertEquals(result.hotels[0].rooms[0].roomName, "Standard");
    assertEquals(result.hotels[0].rooms[0].basePrice, 802.5);
    assertEquals(result.hotels[0].rooms[0].priceWithMarkup, 674.1);
    assertEquals(result.hotels[0].rooms[0].boardCode, "LPD");
    assertEquals(result.hotels[0].rooms[0].boardName, "Logement Petit Déjeuner");
    assertEquals(result.hotels[0].rooms[0].adults, 2);
    assertEquals(result.hotels[0].rooms[0].childrenAges, [3, 8]);
    assertEquals(result.hotels[0].rooms[0].token, "token-xyz");
    assertEquals(result.hotels[0].rooms[0].cancellationPolicy, [{ Policy: "test" }]);
    assertEquals(
      JSON.parse(receivedBody),
      buildHotelSearchPayload({ login: "user", password: "pass" }, params),
    );
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
        BookingId: "456",
        State: "confirmed",
        TotalPrice: "540.75",
        Extra: "value",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const params = {
    token: "token-123",
    preBooking: true,
    customerName: "Guest",
    customerEmail: "guest@example.com",
    customerPhone: "12345678",
    roomSelections: [{ hotelId: 1, roomId: 2 }],
  };

  try {
    const result = await createBooking({ login: "user", password: "pass" }, params);
    assertEquals(result.bookingId, 456);
    assertEquals(result.state, "confirmed");
    assertEquals(result.totalPrice, 540.75);
    assertEquals(result.Extra, "value");
    assertEquals(
      JSON.parse(receivedBody),
      buildBookingCreationPayload({ login: "user", password: "pass" }, params),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const integrationLogin = Deno.env.get("MYGO_LOGIN");
const integrationPassword = Deno.env.get("MYGO_PASSWORD");
const integrationCityId = Number(Deno.env.get("MYGO_TEST_CITY_ID") ?? "");
const hasIntegrationCredentials = Boolean(integrationLogin && integrationPassword);
const hasIntegrationCity = Number.isFinite(integrationCityId) && integrationCityId > 0;

Deno.test({
  name: "MyGo integration: listCities returns at least one city",
  ignore: !hasIntegrationCredentials,
  fn: async () => {
    const cities = await listCities({
      login: integrationLogin as string,
      password: integrationPassword as string,
    });
    assert(cities.length > 0);
  },
});

Deno.test({
  name: "MyGo integration: listHotels returns at least one hotel",
  ignore: !hasIntegrationCredentials || !hasIntegrationCity,
  fn: async () => {
    const hotels = await listHotels(
      {
        login: integrationLogin as string,
        password: integrationPassword as string,
      },
      integrationCityId,
    );
    assert(hotels.length > 0);
  },
});

console.log("✅ All MyGo Client tests passed");
