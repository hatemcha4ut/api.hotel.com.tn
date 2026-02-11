/**
 * MyGo Custom XML Client for Cloudflare Workers
 * 
 * MyGo protocol (NON-NEGOTIABLE):
 * - NOT SOAP - uses plain HTTP POST to https://admin.mygo.co/api/hotel/{ServiceName}
 * - Auth inside XML: <Root><Credential><Login>...</Login><Password>...</Password></Credential>...</Root>
 * - Static data (cities, hotels) must be stored before availability search
 * - HotelSearch returns Token which is required for BookingCreation
 * - BookingCreation supports PreBooking=true (recommended before final confirmation)
 * - Only publish REAL-TIME BOOKABLE inventory: Hotel.Available=true AND room.OnRequest=false
 */

import { parseSimpleXml, SimpleXMLElement } from '../utils/xml';
import type {
  MyGoCredential,
  MyGoCity,
  MyGoHotel,
  MyGoSearchParams,
  MyGoSearchResponse,
  MyGoHotelSearchResult,
  MyGoRoomResult,
  MyGoBookingParams,
  MyGoBookingResponse,
} from '../types/mygo';

const MYGO_BASE_URL = "https://admin.mygo.co/api/hotel";
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2; // Only for idempotent calls (ListCity, HotelSearch)
const RETRY_BASE_MS = 1000; // Base delay for exponential backoff
const RETRY_MAX_MS = 5000; // Maximum retry delay

// XML escaping
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// XML unescaping (kept for potential future use)
// const unescapeXml = (value: string): string => {
//   const withoutAmpersand = value
//     .replaceAll("&lt;", "<")
//     .replaceAll("&gt;", ">")
//     .replaceAll("&quot;", '"')
//     .replaceAll("&apos;", "'");
//   // Decode ampersand last to avoid double-decoding
//   return withoutAmpersand.replaceAll("&amp;", "&");
// };

// Sanitize XML string by removing BOM and null characters
const sanitizeXml = (xmlString: string): string => {
  // Remove UTF-8 BOM if present
  let cleaned = xmlString.charCodeAt(0) === 0xFEFF ? xmlString.slice(1) : xmlString;
  
  // Remove null characters
  cleaned = cleaned.replace(/\u0000/g, "");
  
  return cleaned;
};

// Validate that a string looks like XML (kept for potential future use)
// const validateXmlFormat = (text: string, expectedTag?: string): void => {
//   const trimmed = text.trim();
//   
//   if (!trimmed.startsWith("<")) {
//     const preview = trimmed.slice(0, 200);
//     throw new Error(`Expected XML but got: ${preview}`);
//   }

//   // Check for HTML markers that suggest this is HTML, not XML
//   // Be more specific - check for HTML tags as whole words, not substrings
//   if (/(<!DOCTYPE|<html\s|<\/html|<body\s|<\/body|<head\s|<\/head|<meta\s|<title\s|<script\s|<style\s|<link\s|<img\s|<div\s|<span\s|<p\s|<a\s|<table\s|<form\s|<input\s|<h[1-6]\s|<h[1-6]>)/i.test(trimmed)) {
//     const preview = trimmed.slice(0, 200);
//     throw new Error(`Expected XML but got: ${preview}`);
//   }
//   
//   const hasXmlDeclaration = trimmed.includes("<?xml");
//   const hasExpectedTag = expectedTag ? trimmed.includes(`<${expectedTag}`) : true;
//   
//   if (!hasXmlDeclaration && !hasExpectedTag) {
//     const preview = trimmed.slice(0, 200);
//     throw new Error(
//       `Response does not appear to be valid XML (missing <?xml or <${expectedTag}>): ${preview}`
//     );
//   }
// };

type MyGoCredentialPayload = {
  Credential: { Login: string; Password: string };
};

const buildCredentialPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => {
  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
  };
};

const buildRequestPayload = <T extends Record<string, unknown>>(
  credential: MyGoCredential,
  params: T,
): MyGoCredentialPayload & T => {
  const request = params as Record<string, unknown>;
  if ("Credential" in request) {
    throw new Error("MyGo request params must not include Credential");
  }
  return {
    ...buildCredentialPayload(credential),
    ...params,
  };
};

export type MyGoJsonRequest = Record<string, unknown>;
export type MyGoJsonResponse = Record<string, unknown>;

// Build XML for ListCity
export const buildListCityXml = (credential: MyGoCredential): string => {
  return `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Credential>
    <Login>${escapeXml(credential.login)}</Login>
    <Password>${escapeXml(credential.password)}</Password>
  </Credential>
</Root>`;
};

// Build JSON payload for ListCity
export const buildListCityPayload = (credential: MyGoCredential): {
  Credential: { Login: string; Password: string };
} => {
  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
  };
};

// Build XML for ListHotel
export const buildListHotelXml = (
  credential: MyGoCredential,
  cityId: number,
): string => {
  return `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Credential>
    <Login>${escapeXml(credential.login)}</Login>
    <Password>${escapeXml(credential.password)}</Password>
  </Credential>
  <CityId>${escapeXml(String(cityId))}</CityId>
</Root>`;
};

// Build JSON payload for ListHotel
export const buildListHotelPayload = (
  credential: MyGoCredential,
  cityId: number,
): {
  Credential: { Login: string; Password: string };
  CityId: number;
} => {
  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
    CityId: cityId,
  };
};

// Build XML for HotelSearch
export const buildHotelSearchXml = (
  credential: MyGoCredential,
  params: MyGoSearchParams,
): string => {
  const roomsXml = params.rooms
    .map((room) => {
      const childrenXml = room.childrenAges && room.childrenAges.length > 0
        ? room.childrenAges
          .map((age) => `<Child>${age}</Child>`)
          .join("")
        : "";
      return `<Room>
      <Adults>${room.adults}</Adults>
      ${childrenXml}
    </Room>`;
    })
    .join("");

  const onlyAvailable = params.onlyAvailable ?? true;
  const currency = params.currency ?? "TND";

  return `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Credential>
    <Login>${escapeXml(credential.login)}</Login>
    <Password>${escapeXml(credential.password)}</Password>
  </Credential>
  <CityId>${params.cityId}</CityId>
  <CheckIn>${escapeXml(params.checkIn)}</CheckIn>
  <CheckOut>${escapeXml(params.checkOut)}</CheckOut>
  <Currency>${escapeXml(currency)}</Currency>
  <OnlyAvailable>${onlyAvailable}</OnlyAvailable>
  <Rooms>
    ${roomsXml}
  </Rooms>
</Root>`;
};

// Build JSON payload for HotelSearch
export const buildHotelSearchPayload = (
  credential: MyGoCredential,
  params: MyGoSearchParams,
): {
  Credential: { Login: string; Password: string };
  SearchDetails: {
    City: number;
    BookingDetails: {
      CheckIn: string;
      CheckOut: string;
      Hotels: number[];
    };
    Filters: {
      Keywords: string;
      Category: string[];
      OnlyAvailable: boolean;
      Tags: string[];
    };
    Rooms: Array<{ Adult: number; Child: number[] }>;
  };
} => {
  // Defensive validation: ensure City field is valid before sending to MyGo
  if (typeof params.cityId !== "number" || !Number.isInteger(params.cityId) || params.cityId <= 0) {
    throw new Error(`Invalid cityId for MyGo HotelSearch: ${params.cityId} (must be positive integer)`);
  }

  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
    SearchDetails: {
      City: params.cityId,
      BookingDetails: {
        CheckIn: params.checkIn,
        CheckOut: params.checkOut,
        Hotels: params.hotelIds ?? [],
      },
      Filters: {
        Keywords: "",
        Category: [],
        OnlyAvailable: params.onlyAvailable ?? false,
        Tags: [],
      },
      Rooms: params.rooms.map((room) => ({
        Adult: room.adults,
        Child: room.childrenAges ?? [],
      })),
    },
  };
};


// Build XML for BookingCreation
export const buildBookingCreationXml = (
  credential: MyGoCredential,
  params: MyGoBookingParams,
): string => {
  const roomSelectionsXml = params.roomSelections
    .map((selection) => {
      return `<RoomSelection>
      <HotelId>${selection.hotelId}</HotelId>
      <RoomId>${selection.roomId}</RoomId>
    </RoomSelection>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<Root>
  <Credential>
    <Login>${escapeXml(credential.login)}</Login>
    <Password>${escapeXml(credential.password)}</Password>
  </Credential>
  <Token>${escapeXml(params.token)}</Token>
  <PreBooking>${params.preBooking}</PreBooking>
  <CustomerName>${escapeXml(params.customerName)}</CustomerName>
  <CustomerEmail>${escapeXml(params.customerEmail)}</CustomerEmail>
  <CustomerPhone>${escapeXml(params.customerPhone)}</CustomerPhone>
  <RoomSelections>
    ${roomSelectionsXml}
  </RoomSelections>
</Root>`;
};

// Build JSON payload for BookingCreation
export const buildBookingCreationPayload = (
  credential: MyGoCredential,
  params: MyGoBookingParams,
): {
  Credential: { Login: string; Password: string };
  Token: string;
  PreBooking: boolean;
  CustomerName: string;
  CustomerEmail: string;
  CustomerPhone: string;
  RoomSelections: Array<{ HotelId: number; RoomId: number }>;
} => {
  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
    Token: params.token,
    PreBooking: params.preBooking,
    CustomerName: params.customerName,
    CustomerEmail: params.customerEmail,
    CustomerPhone: params.customerPhone,
    RoomSelections: params.roomSelections.map((selection) => ({
      HotelId: selection.hotelId,
      RoomId: selection.roomId,
    })),
  };
};

export const buildListCountryPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildListCategoriePayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildListBoardingPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildListTagPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildListLanguagePayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildListCurrencyPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildCreditCheckPayload = (
  credential: MyGoCredential,
): MyGoCredentialPayload => buildCredentialPayload(credential);

export const buildHotelDetailPayload = (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): MyGoCredentialPayload & MyGoJsonRequest => buildRequestPayload(credential, params);

export const buildHotelCancellationPolicyPayload = (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): MyGoCredentialPayload & MyGoJsonRequest => buildRequestPayload(credential, params);

export const buildBookingCancellationPayload = (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): MyGoCredentialPayload & MyGoJsonRequest => buildRequestPayload(credential, params);

export const buildBookingListPayload = (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): MyGoCredentialPayload & MyGoJsonRequest => buildRequestPayload(credential, params);

export const buildBookingDetailsPayload = (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): MyGoCredentialPayload & MyGoJsonRequest => buildRequestPayload(credential, params);

// Parse XML to object
const parseXmlToObject = (xmlString: string): SimpleXMLElement | null => {
  try {
    const doc = parseSimpleXml(xmlString);
    
    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      console.error("XML Parse Error:", parseError.textContent);
      return null;
    }
    
    return doc.documentElement;
  } catch (error) {
    console.error("Failed to parse XML:", error);
    return null;
  }
};

// Extract text content from XML element
const getElementText = (element: SimpleXMLElement | null, tagName: string): string => {
  if (!element) return "";
  const child = element.querySelector(tagName);
  return child?.textContent?.trim() ?? "";
};

// Extract number from XML element
const getElementNumber = (element: SimpleXMLElement | null, tagName: string): number => {
  const text = getElementText(element, tagName);
  const num = parseInt(text, 10);
  return isNaN(num) ? 0 : num;
};

// Extract boolean from XML element
const getElementBoolean = (element: SimpleXMLElement | null, tagName: string): boolean => {
  const text = getElementText(element, tagName).toLowerCase();
  return text === "true" || text === "1";
};

// Parse ListCity response
export const parseListCityResponse = (xmlString: string): MyGoCity[] => {
  const doc = parseXmlToObject(xmlString);
  if (!doc) {
    throw new Error("Failed to parse ListCity XML");
  }
  
  const cities: MyGoCity[] = [];
  const cityElements = doc.querySelectorAll("City");
  
  for (const cityElement of cityElements) {
    const id = getElementNumber(cityElement, "Id");
    const name = getElementText(cityElement, "Name");
    const region = getElementText(cityElement, "Region");
    
    if (id && name) {
      cities.push({
        id,
        name,
        region: region || undefined,
      });
    }
  }
  
  return cities;
};

// Parse ListHotel response
export const parseListHotelResponse = (
  xmlString: string,
  cityId: number,
): MyGoHotel[] => {
  const doc = parseXmlToObject(xmlString);
  if (!doc) {
    throw new Error("Failed to parse ListHotel XML");
  }
  
  const hotels: MyGoHotel[] = [];
  const hotelElements = doc.querySelectorAll("Hotel");
  
  for (const hotelElement of hotelElements) {
    const id = getElementNumber(hotelElement, "Id");
    const name = getElementText(hotelElement, "Name");
    const star = getElementText(hotelElement, "Star");
    const categoryTitle = getElementText(hotelElement, "CategoryTitle");
    const address = getElementText(hotelElement, "Address");
    const longitude = getElementText(hotelElement, "Longitude");
    const latitude = getElementText(hotelElement, "Latitude");
    const image = getElementText(hotelElement, "Image");
    const note = getElementText(hotelElement, "Note");
    
    if (id && name) {
      hotels.push({
        id,
        name,
        cityId,
        star: star || undefined,
        categoryTitle: categoryTitle || undefined,
        address: address || undefined,
        longitude: longitude || undefined,
        latitude: latitude || undefined,
        image: image || undefined,
        note: note || undefined,
      });
    }
  }
  
  return hotels;
};

// Parse HotelSearch response
export const parseHotelSearchResponse = (xmlString: string): MyGoSearchResponse => {
  const doc = parseXmlToObject(xmlString);
  if (!doc) {
    throw new Error("Failed to parse HotelSearch XML");
  }
  
  const hotels: MyGoHotelSearchResult[] = [];
  const token = getElementText(doc, "Token");
  
  const hotelElements = doc.querySelectorAll("Hotel");
  
  for (const hotelElement of hotelElements) {
    const id = getElementNumber(hotelElement, "Id");
    const name = getElementText(hotelElement, "Name");
    const available = getElementBoolean(hotelElement, "Available");
    
    if (id && name) {
      hotels.push({
        id,
        name,
        available,
        rooms: [],
      });
    }
  }
  
  return { token, hotels };
};

// Parse BookingCreation response
export const parseBookingCreationResponse = (xmlString: string): MyGoBookingResponse => {
  const doc = parseXmlToObject(xmlString);
  if (!doc) {
    throw new Error("Failed to parse BookingCreation XML");
  }
  
  const bookingId = getElementNumber(doc, "BookingId");
  const state = getElementText(doc, "State");
  const totalPrice = getElementNumber(doc, "TotalPrice");
  
  return {
    bookingId: bookingId || undefined,
    state: state || undefined,
    totalPrice: totalPrice || undefined,
  };
};

export const postXml = async (
  serviceName: string,
  xml: string,
  options: {
    timeout?: number;
    retries?: number;
    idempotent?: boolean;
  } = {},
): Promise<string> => {
  const timeout = options.timeout ?? REQUEST_TIMEOUT_MS;
  const maxRetries = options.idempotent ? (options.retries ?? MAX_RETRIES) : 0;
  const url = `${MYGO_BASE_URL}/${serviceName}`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: xml,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Get response text for diagnostics
      const responseText = await response.text();
      
      // Enhanced diagnostics: log response metadata
      const contentType = response.headers.get("content-type") || "unknown";
      console.log(
        `[MyGo ${serviceName}] Response status: ${response.status}, content-type: ${contentType}`
      );
      
      // Check response status before parsing
      if (!response.ok) {
        const preview = responseText.slice(0, 400);
        console.error(
          `[MyGo ${serviceName}] Error response preview:`,
          preview
        );
        throw new Error(
          `MyGo API error: ${response.status} ${response.statusText}. Response preview: ${preview}`
        );
      }
      
      // Check if response is XML before processing
      const trimmed = responseText.trim();
      if (!trimmed.startsWith("<")) {
        const errorPreview = trimmed.slice(0, 400);
        throw new Error(
          `MyGo returned non-XML response for ${serviceName} (likely invalid credentials or blocked request): ${errorPreview}`
        );
      }
      
      // Log safe preview of successful response (no secrets in response)
      const preview = responseText.slice(0, 400);
      console.log(`[MyGo ${serviceName}] Response preview:`, preview);
      
      // Sanitize and validate XML before returning
      const sanitized = sanitizeXml(responseText);
      
      return sanitized;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on abort (timeout) or non-idempotent calls
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MyGo API timeout after ${timeout}ms`);
      }
      
      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const backoffMs = Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw lastError ?? new Error("MyGo API request failed");
};

// POST JSON to MyGo API
export const postJson = async (
  serviceName: string,
  payload: unknown,
): Promise<unknown> => {
  const url = `${MYGO_BASE_URL}/${serviceName}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(`MyGo error ${response.status}: ${responseText.slice(0, 400)}`);
    }

    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(
        `Unexpected MyGo response type for ${serviceName}: ${contentType}`,
      );
    }

    return JSON.parse(responseText);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`MyGo API timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const myGoPostJson = async <T = MyGoJsonResponse>(
  serviceName: string,
  payload: unknown,
): Promise<T> => {
  return (await postJson(serviceName, payload)) as T;
};

const parseJsonBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
};

const normalizeJsonNumber = (value: number | undefined): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

// High-level API methods
const extractListResponse = (
  data: unknown,
  listKey: string,
): MyGoJsonResponse[] => {
  const list = Array.isArray((data as Record<string, unknown>)[listKey])
    ? ((data as Record<string, MyGoJsonResponse[]>)[listKey])
    : null;

  if (!list) {
    throw new Error(`Missing ${listKey} in response`);
  }

  return list;
};

export const listCountries = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson(
    "ListCountry",
    buildListCountryPayload(credential),
  );
  return extractListResponse(data, "ListCountry");
};

export const listCategories = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson(
    "ListCategorie",
    buildListCategoriePayload(credential),
  );
  return extractListResponse(data, "ListCategorie");
};

export const listBoardings = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson(
    "ListBoarding",
    buildListBoardingPayload(credential),
  );
  return extractListResponse(data, "ListBoarding");
};

export const listTags = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson("ListTag", buildListTagPayload(credential));
  return extractListResponse(data, "ListTag");
};

export const listLanguages = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson(
    "ListLanguage",
    buildListLanguagePayload(credential),
  );
  return extractListResponse(data, "ListLanguage");
};

export const listCurrencies = async (
  credential: MyGoCredential,
): Promise<MyGoJsonResponse[]> => {
  const data = await myGoPostJson(
    "ListCurrency",
    buildListCurrencyPayload(credential),
  );
  return extractListResponse(data, "ListCurrency");
};

// CreditCheck - Get remaining deposit balance
export const creditCheck = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest = {}, // Optional additional parameters
): Promise<{ RemainingDeposit: number; Currency: string }> => {
  const response = await myGoPostJson<{ RemainingDeposit: number; Currency: string }>(
    "CreditCheck",
    buildCreditCheckPayload(credential),
  );
  return response;
};

export const hotelDetail = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): Promise<MyGoJsonResponse> => {
  return myGoPostJson(
    "HotelDetail",
    buildHotelDetailPayload(credential, params),
  );
};

export const hotelCancellationPolicy = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): Promise<MyGoJsonResponse> => {
  return myGoPostJson(
    "HotelCancellationPolicy",
    buildHotelCancellationPolicyPayload(credential, params),
  );
};

export const bookingCancellation = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): Promise<MyGoJsonResponse> => {
  return myGoPostJson(
    "BookingCancellation",
    buildBookingCancellationPayload(credential, params),
  );
};

export const bookingList = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): Promise<MyGoJsonResponse> => {
  return myGoPostJson(
    "BookingList",
    buildBookingListPayload(credential, params),
  );
};

export const bookingDetails = async (
  credential: MyGoCredential,
  params: MyGoJsonRequest,
): Promise<MyGoJsonResponse> => {
  return myGoPostJson(
    "BookingDetails",
    buildBookingDetailsPayload(credential, params),
  );
};

export const listCities = async (credential: MyGoCredential): Promise<MyGoCity[]> => {
  const data = await postJson("ListCity", buildListCityPayload(credential));
  const listCity = Array.isArray((data as { ListCity?: unknown }).ListCity)
    ? (data as { ListCity: Array<Record<string, unknown>> }).ListCity
    : null;

  if (!listCity || listCity.length === 0) {
    throw new Error("No ListCity elements found in ListCity response");
  }

  const cities: MyGoCity[] = [];
  listCity.forEach((city) => {
    const id = Number(city.Id);
    const name = city.Name ? String(city.Name) : "";
    const region = city.Region ? String(city.Region) : undefined;

    if (Number.isFinite(id) && name) {
      cities.push({
        id,
        name,
        region,
      });
    }
  });

  return cities;
};

export const listHotels = async (
  credential: MyGoCredential,
  cityId: number,
): Promise<MyGoHotel[]> => {
  const data = await postJson("ListHotel", buildListHotelPayload(credential, cityId));
  const listHotel = Array.isArray((data as { ListHotel?: unknown }).ListHotel)
    ? (data as { ListHotel: Array<Record<string, unknown>> }).ListHotel
    : null;

  if (!listHotel || listHotel.length === 0) {
    throw new Error(`ListHotel returned no hotels for cityId ${cityId}`);
  }

  const hotels: MyGoHotel[] = [];
  listHotel.forEach((hotel) => {
    const id = Number(hotel.Id);
    const name = hotel.Name ? String(hotel.Name) : "";
    const cityIdValue = Number(hotel.CityId);
    // Fall back to the requested cityId when MyGo omits, returns null, or zeros the CityId field.
    const resolvedCityId = Number.isFinite(cityIdValue) && cityIdValue > 0
      ? cityIdValue
      : cityId;

    if (Number.isFinite(id) && id !== 0 && name) {
      hotels.push({
        id,
        name,
        cityId: resolvedCityId,
        star: hotel.Star != null ? String(hotel.Star) : undefined,
        categoryTitle: hotel.CategoryTitle != null ? String(hotel.CategoryTitle) : undefined,
        address: hotel.Address != null ? String(hotel.Address) : undefined,
        longitude: hotel.Longitude != null ? String(hotel.Longitude) : undefined,
        latitude: hotel.Latitude != null ? String(hotel.Latitude) : undefined,
        image: hotel.Image != null ? String(hotel.Image) : undefined,
        note: hotel.Note != null ? String(hotel.Note) : undefined,
      });
    }
  });

  return hotels;
};

export const searchHotels = async (
  credential: MyGoCredential,
  params: MyGoSearchParams,
): Promise<MyGoSearchResponse> => {
  const payload = buildHotelSearchPayload(credential, params);
  
  // Debug log: Confirm City value sent to MyGo API
  console.log(`[MyGo HotelSearch] City field value: ${payload.SearchDetails.City}`);
  
  const safePayload = {
    ...payload,
    Credential: {
      ...payload.Credential,
      Password: "***",
    },
  };
  console.log("[MyGo HotelSearch] request payload:", JSON.stringify(safePayload).slice(0, 400));
  const data = await postJson("HotelSearch", payload);

  const errorMessage = (data as { ErrorMessage?: { Code?: unknown; Description?: unknown } })
    .ErrorMessage;
  if (errorMessage?.Code) {
    throw new Error(
      `MyGo HotelSearch error ${errorMessage.Code}: ${errorMessage.Description}`,
    );
  }

  type MyGoHotelSearchJson = Record<string, unknown> & {
    Hotel?: Record<string, unknown>;
    Token?: string;
  };

  const items = Array.isArray((data as { HotelSearch?: unknown }).HotelSearch)
    ? ((data as { HotelSearch: MyGoHotelSearchJson[] }).HotelSearch)
    : [];

  const hotelsById = new Map<number, MyGoHotelSearchResult>();
  let fallbackToken = "";

  items.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const hotelData = typeof item.Hotel === "object" && item.Hotel !== null
      ? item.Hotel
      : {};
    const idValue = (hotelData as { Id?: unknown }).Id;
    const id = typeof idValue === "number" ? idValue : Number(idValue);
    const name = typeof (hotelData as { Name?: unknown }).Name === "string"
      ? String((hotelData as { Name?: unknown }).Name)
      : "";
    if (!Number.isFinite(id) || id === 0 || !name) {
      return;
    }

    const token = typeof item.Token === "string" ? item.Token : undefined;
    if (!fallbackToken && token) {
      fallbackToken = token;
    }

    let hotelResult = hotelsById.get(id);
    if (!hotelResult) {
      const categoryData = typeof (hotelData as { Category?: unknown }).Category === "object" &&
          (hotelData as { Category?: unknown }).Category !== null
        ? (hotelData as { Category?: Record<string, unknown> }).Category
        : {};
      const cityData = typeof (hotelData as { City?: unknown }).City === "object" &&
          (hotelData as { City?: unknown }).City !== null
        ? (hotelData as { City?: Record<string, unknown> }).City
        : {};
      const cityIdValue = (cityData as { Id?: unknown }).Id;
      const cityId = normalizeJsonNumber(
        typeof cityIdValue === "number" ? cityIdValue : Number(cityIdValue),
      );
      const starValue = (categoryData as { Star?: unknown }).Star;
      const star = normalizeJsonNumber(
        typeof starValue === "number" ? starValue : Number(starValue),
      );
      const themes = Array.isArray((hotelData as { Theme?: unknown }).Theme)
        ? (hotelData as { Theme: unknown[] }).Theme.map((theme) => String(theme))
        : undefined;
      const facilities = Array.isArray((hotelData as { Facilities?: unknown }).Facilities)
        ? (hotelData as { Facilities: unknown[] }).Facilities
        : undefined;

      hotelResult = {
        id,
        name,
        available: false,
        rooms: [],
        cityId,
        cityName: typeof (cityData as { Name?: unknown }).Name === "string"
          ? String((cityData as { Name?: unknown }).Name)
          : undefined,
        categoryTitle: typeof (categoryData as { Title?: unknown }).Title === "string"
          ? String((categoryData as { Title?: unknown }).Title)
          : undefined,
        star,
        address: typeof (hotelData as { Adress?: unknown }).Adress === "string"
          ? String((hotelData as { Adress?: unknown }).Adress)
          : undefined,
        image: typeof (hotelData as { Image?: unknown }).Image === "string"
          ? String((hotelData as { Image?: unknown }).Image)
          : undefined,
        themes,
        facilities,
      };

      const note = (hotelData as { Note?: unknown }).Note;
      if (note !== undefined) {
        hotelResult.note = note;
      }

      hotelsById.set(id, hotelResult);
    }

    const priceData = typeof item.Price === "object" && item.Price !== null
      ? (item.Price as Record<string, unknown>)
      : undefined;
    const boardings = Array.isArray(priceData?.Boarding) ? priceData?.Boarding : [];

    boardings.forEach((boarding) => {
      if (!boarding || typeof boarding !== "object") {
        return;
      }

      const boardingData = boarding as Record<string, unknown>;
      const boardCode = boardingData.Code != null ? String(boardingData.Code) : undefined;
      const boardName = boardingData.Name != null ? String(boardingData.Name) : undefined;
      const paxList = Array.isArray(boardingData.Pax) ? boardingData.Pax : [];

      paxList.forEach((pax) => {
        if (!pax || typeof pax !== "object") {
          return;
        }

        const paxData = pax as Record<string, unknown>;
        const adultValue = paxData.Adult;
        const adults = normalizeJsonNumber(
          typeof adultValue === "number" ? adultValue : Number(adultValue),
        );
        const childrenArray = Array.isArray(paxData.Child) ? paxData.Child : [];
        const childrenAges = childrenArray.length > 0
          ? childrenArray
            .map((age) => Number(age))
            .filter((age) => Number.isFinite(age))
          : undefined;
        const roomList = Array.isArray(paxData.Rooms) ? paxData.Rooms : [];

        roomList.forEach((room) => {
          if (!room || typeof room !== "object") {
            return;
          }

          const roomData = room as Record<string, unknown>;
          const onRequest = parseJsonBoolean(roomData.StopReservation);
          const price = normalizeJsonNumber(
            roomData.Price != null ? Number(roomData.Price) : undefined,
          );
          const basePrice = normalizeJsonNumber(
            roomData.BasePrice != null ? Number(roomData.BasePrice) : undefined,
          );
          const priceWithMarkup = normalizeJsonNumber(
            roomData.PriceWithAffiliateMarkup != null
              ? Number(roomData.PriceWithAffiliateMarkup)
              : undefined,
          );
          const roomId = normalizeJsonNumber(
            roomData.Id != null ? Number(roomData.Id) : undefined,
          );
          const roomName = roomData.Name != null ? String(roomData.Name) : undefined;
          const cancellationPolicy = Array.isArray(roomData.CancellationPolicy)
            ? roomData.CancellationPolicy
            : undefined;

          hotelResult!.rooms.push({
            ...roomData,
            onRequest,
            price,
            roomId,
            roomName,
            basePrice,
            priceWithMarkup,
            boardCode,
            boardName,
            adults,
            childrenAges,
            token,
            cancellationPolicy,
          } as MyGoRoomResult);

          if (!onRequest) {
            hotelResult!.available = true;
          }
        });
      });
    });
  });

  const hotels = Array.from(hotelsById.values()).map((hotel) => {
    const hasInstantConfirmation = hotel.rooms.some((room) => room.onRequest === false);
    return {
      ...hotel,
      available: hasInstantConfirmation,
      hasInstantConfirmation,
    };
  });

  return { token: fallbackToken, hotels };
};

export const createBooking = async (
  credential: MyGoCredential,
  params: MyGoBookingParams,
): Promise<MyGoBookingResponse> => {
  const data = await postJson(
    "BookingCreation",
    buildBookingCreationPayload(credential, params),
  );

  if (!data || typeof data !== "object") {
    throw new Error("Invalid BookingCreation response");
  }

  const bookingData = data as Record<string, unknown>;
  const bookingIdValue = bookingData.BookingId;
  const bookingId = bookingIdValue != null ? Number(bookingIdValue) : undefined;
  const state = bookingData.State != null ? String(bookingData.State) : undefined;
  const totalPriceValue = bookingData.TotalPrice;
  const totalPrice = totalPriceValue != null ? Number(totalPriceValue) : undefined;

  const normalizedBookingId = normalizeJsonNumber(bookingId);
  const normalizedTotalPrice = normalizeJsonNumber(totalPrice);
  const response: MyGoBookingResponse = {
    bookingId: normalizedBookingId,
    state,
    totalPrice: normalizedTotalPrice,
  };

  Object.entries(bookingData).forEach(([key, value]) => {
    if (key !== "BookingId" && key !== "State" && key !== "TotalPrice") {
      response[key] = value;
    }
  });

  return response;
};

// Filter out non-bookable results
export const filterBookableHotels = (
  hotels: MyGoHotelSearchResult[],
): MyGoHotelSearchResult[] => {
  const totalHotels = hotels.length;
  let removedUnavailableHotels = 0;
  let removedOnRequestRooms = 0;
  const filteredHotels = hotels
    .filter((hotel) => {
      const isAvailable = hotel.available === true;
      if (!isAvailable) {
        removedUnavailableHotels += 1;
      }
      return isAvailable;
    })
    .map((hotel) => ({
      ...hotel,
      rooms: hotel.rooms.filter((room) => {
        const keepRoom = room.onRequest === false;
        if (!keepRoom) {
          removedOnRequestRooms += 1;
        }
        return keepRoom;
      }),
    }))
    .filter((hotel) => hotel.rooms.length > 0);

  console.log("[MYGO] filterBookableHotels counts", {
    totalHotels,
    removedUnavailableHotels,
    removedOnRequestRooms,
  });

  return filteredHotels;
};

export const filterVisibleHotels = (
  hotels: MyGoHotelSearchResult[],
): MyGoHotelSearchResult[] => {
  return hotels.map((hotel) => {
    const rooms = hotel.rooms.filter(
      (room) => room.price !== null && room.price !== undefined,
    );
    const hasInstantConfirmation = rooms.some((room) => room.onRequest === false);
    return {
      ...hotel,
      rooms,
      hasInstantConfirmation,
    };
  });
};
