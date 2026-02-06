/**
 * MyGo Custom XML Client
 * 
 * MyGo protocol (NON-NEGOTIABLE):
 * - NOT SOAP - uses plain HTTP POST to https://admin.mygo.co/api/hotel/{ServiceName}
 * - Auth inside XML: <Root><Credential><Login>...</Login><Password>...</Password></Credential>...</Root>
 * - Static data (cities, hotels) must be stored before availability search
 * - HotelSearch returns Token which is required for BookingCreation
 * - BookingCreation supports PreBooking=true (recommended before final confirmation)
 * - Only publish REAL-TIME BOOKABLE inventory: Hotel.Available=true AND room.OnRequest=false
 */

// Simple XML element wrapper for Deno compatibility
class SimpleXMLElement {
  constructor(
    public tagName: string,
    public textContent: string = "",
    public children: SimpleXMLElement[] = [],
  ) {}

  querySelector(selector: string): SimpleXMLElement | null {
    // Direct child search first
    for (const child of this.children) {
      if (child.tagName === selector) {
        return child;
      }
    }
    // Deep search
    for (const child of this.children) {
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  querySelectorAll(selector: string): SimpleXMLElement[] {
    const results: SimpleXMLElement[] = [];
    
    // Check all children recursively
    for (const child of this.children) {
      if (child.tagName === selector) {
        results.push(child);
      }
      // Also search in children of children
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  appendChild(child: SimpleXMLElement): void {
    this.children.push(child);
  }

  get documentElement(): SimpleXMLElement {
    return this;
  }
}

// Simple XML Document wrapper
class SimpleXMLDocument {
  documentElement: SimpleXMLElement;

  constructor() {
    this.documentElement = new SimpleXMLElement("Document");
  }

  querySelector(selector: string): SimpleXMLElement | null {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): SimpleXMLElement[] {
    return this.documentElement.querySelectorAll(selector);
  }
}

// Parse XML string into our simple DOM structure
const parseSimpleXml = (xmlString: string): SimpleXMLDocument => {
  const doc = new SimpleXMLDocument();
  
  // Tokenize XML
  const tokens: Array<{ type: string; name?: string; text?: string }> = [];
  const tokenRegex = /<\?[^?]*\?>|<!\[CDATA\[[^\]]*\]\]>|<!--[^-]*(?:-[^-]+)*-->|<\/([a-zA-Z_][a-zA-Z0-9_:-]*)>|<([a-zA-Z_][a-zA-Z0-9_:-]*)\s*\/?>|([^<]+)/g;
  
  let match;
  while ((match = tokenRegex.exec(xmlString)) !== null) {
    if (match[0].startsWith("<?") || match[0].startsWith("<!") || match[0].startsWith("<!--")) {
      // Skip declarations and comments
      continue;
    } else if (match[0].startsWith("</")) {
      // Closing tag
      tokens.push({ type: "close", name: match[1] });
    } else if (match[0].startsWith("<")) {
      // Opening tag (with or without self-close)
      const tagName = match[2];
      const isSelfClosing = match[0].endsWith("/>");
      tokens.push({ type: isSelfClosing ? "selfclose" : "open", name: tagName });
    } else {
      // Text content
      const text = match[3].trim();
      if (text.length > 0) {
        tokens.push({ type: "text", text });
      }
    }
  }
  
  // Build element tree with validation
  const stack: SimpleXMLElement[] = [doc.documentElement];
  const tagStack: string[] = ["Document"];
  let currentText = "";
  
  for (const token of tokens) {
    if (token.type === "text") {
      currentText += (token.text || "");
    } else if (token.type === "open" || token.type === "selfclose") {
      const element = new SimpleXMLElement(token.name || "", currentText);
      currentText = "";
      
      if (stack.length > 0) {
        stack[stack.length - 1].appendChild(element);
      }
      
      if (token.type === "open") {
        stack.push(element);
        tagStack.push(token.name || "");
      }
    } else if (token.type === "close") {
      if (stack.length > 1) {
        const closing = stack.pop();
        tagStack.pop();
        
        if (closing) {
          if (closing.tagName !== token.name) {
            throw new Error(`XML tag mismatch: expected </${closing.tagName}> but got </${token.name}>`);
          }
          if (currentText) {
            closing.textContent = currentText;
          }
        }
      }
      currentText = "";
    }
  }
  
  return doc;
};

const MYGO_BASE_URL = "https://admin.mygo.co/api/hotel";
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2; // Only for idempotent calls (ListCity, HotelSearch)
const RETRY_BASE_MS = 1000; // Base delay for exponential backoff
const RETRY_MAX_MS = 5000; // Maximum retry delay

// XML escaping
const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

// XML unescaping
const unescapeXml = (value: string): string => {
  const withoutAmpersand = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  // Decode ampersand last to avoid double-decoding
  return withoutAmpersand.replaceAll("&amp;", "&");
};

// Sanitize XML string by removing BOM and null characters
const sanitizeXml = (xmlString: string): string => {
  // Remove UTF-8 BOM if present
  let cleaned = xmlString.charCodeAt(0) === 0xFEFF ? xmlString.slice(1) : xmlString;
  
  // Remove null characters
  cleaned = cleaned.replace(/\u0000/g, "");
  
  return cleaned;
};

// Validate that a string looks like XML
const validateXmlFormat = (text: string, expectedTag?: string): void => {
  const trimmed = text.trim();
  
  if (!trimmed.startsWith("<")) {
    const preview = trimmed.slice(0, 200);
    throw new Error(`Expected XML but got: ${preview}`);
  }

  // Check for HTML markers that suggest this is HTML, not XML
  // Be more specific - check for HTML tags as whole words, not substrings
  if (/(<!DOCTYPE|<html\s|<\/html|<body\s|<\/body|<head\s|<\/head|<meta\s|<title\s|<script\s|<style\s|<link\s|<img\s|<div\s|<span\s|<p\s|<a\s|<table\s|<form\s|<input\s|<h[1-6]\s|<h[1-6]>)/i.test(trimmed)) {
    const preview = trimmed.slice(0, 200);
    throw new Error(`Expected XML but got: ${preview}`);
  }
  
  const hasXmlDeclaration = trimmed.includes("<?xml");
  const hasExpectedTag = expectedTag ? trimmed.includes(`<${expectedTag}`) : true;
  
  if (!hasXmlDeclaration && !hasExpectedTag) {
    const preview = trimmed.slice(0, 200);
    throw new Error(
      `Response does not appear to be valid XML (missing <?xml or <${expectedTag}>): ${preview}`
    );
  }
};

// Type definitions
export interface MyGoCredential {
  login: string;
  password: string;
}

export interface MyGoCity {
  id: number;
  name: string;
  region?: string;
}

export interface MyGoHotel {
  id: number;
  name: string;
  cityId: number;
  star?: string;
  categoryTitle?: string;
  address?: string;
  longitude?: string;
  latitude?: string;
  image?: string;
  note?: string;
}

export interface MyGoRoom {
  adults: number;
  childrenAges?: number[];
}

export interface MyGoSearchParams {
  cityId: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  rooms: MyGoRoom[];
  hotelIds?: number[];
  currency?: "TND" | "EUR" | "USD";
  onlyAvailable?: boolean;
}

export interface MyGoHotelSearchResult {
  id: number;
  name: string;
  available: boolean;
  rooms: MyGoRoomResult[];
  [key: string]: unknown;
}

export interface MyGoRoomResult {
  onRequest: boolean;
  price?: number;
  [key: string]: unknown;
}

type MyGoHotelSearchJson = Record<string, unknown> & {
  Id?: number;
  Name?: string;
  Available?: boolean;
  Rooms?: MyGoRoomSearchJson[];
};

type MyGoRoomSearchJson = Record<string, unknown> & {
  OnRequest?: boolean;
  Price?: number;
};

export interface MyGoSearchResponse {
  token: string;
  hotels: MyGoHotelSearchResult[];
}

export interface MyGoBookingParams {
  token: string;
  preBooking: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  roomSelections: Array<{
    hotelId: number;
    roomId: number;
  }>;
}

export interface MyGoBookingResponse {
  bookingId?: number;
  state?: string;
  totalPrice?: number;
  [key: string]: unknown;
}

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
  return {
    Credential: {
      Login: credential.login,
      Password: credential.password,
    },
    SearchDetails: {
      BookingDetails: {
        CheckIn: params.checkIn,
        CheckOut: params.checkOut,
        Hotels: params.hotelIds ?? [],
      },
      Filters: {
        Keywords: "",
        Category: [],
        OnlyAvailable: params.onlyAvailable ?? true,
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

// Parse XML to object
const parseXmlToObject = (xmlString: string): any => {
  try {
    const doc = parseSimpleXml(xmlString);
    
    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      console.error("XML Parse Error:", parseError.textContent);
      return null;
    }
    
    return doc;
  } catch (error) {
    console.error("Failed to parse XML:", error);
    return null;
  }
};

// Extract text content from XML element
const getElementText = (element: any, tagName: string): string => {
  if (!element) return "";
  const child = element.querySelector(tagName);
  return child?.textContent?.trim() ?? "";
};

// Extract number from XML element
const getElementNumber = (element: any, tagName: string): number => {
  const text = getElementText(element, tagName);
  const num = parseInt(text, 10);
  return isNaN(num) ? 0 : num;
};

// Extract boolean from XML element
const getElementBoolean = (element: any, tagName: string): boolean => {
  const text = getElementText(element, tagName).toLowerCase();
  return text === "true" || text === "1";
};

// Parse ListCity response
export const parseListCityResponse = (xmlString: string): MyGoCity[] => {
  // Sanitize and validate XML format
  const sanitized = sanitizeXml(xmlString);
  validateXmlFormat(sanitized);
  
  const doc = parseXmlToObject(sanitized);
  if (!doc) {
    const preview = sanitized.slice(0, 200);
    throw new Error(`Failed to parse ListCity XML response. Preview: ${preview}`);
  }

  const cities: MyGoCity[] = [];
  const cityElements = doc.querySelectorAll("City");
  
  // Verify at least one City element exists
  if (cityElements.length === 0) {
    const preview = sanitized.slice(0, 200);
    throw new Error(`No <City> elements found in ListCity response. Preview: ${preview}`);
  }
  
  cityElements.forEach((cityEl: any) => {
    const id = getElementNumber(cityEl, "Id");
    const name = getElementText(cityEl, "Name");
    const region = getElementText(cityEl, "Region");
    
    if (Number.isFinite(id) && name) {
      cities.push({
        id,
        name,
        region: region || undefined,
      });
    }
  });

  return cities;
};

// Parse ListHotel response
export const parseListHotelResponse = (
  xmlString: string,
  fallbackCityId?: number,
): MyGoHotel[] => {
  // Sanitize and validate XML format
  const sanitized = sanitizeXml(xmlString);
  validateXmlFormat(sanitized, "ListHotel");
  
  const doc = parseXmlToObject(sanitized);
  if (!doc) {
    const preview = sanitized.slice(0, 200);
    throw new Error(`Failed to parse ListHotel XML response. Preview: ${preview}`);
  }

  const hotels: MyGoHotel[] = [];
  const hotelElements = doc.querySelectorAll("Hotel");

  hotelElements.forEach((hotelEl: any) => {
    const id = getElementNumber(hotelEl, "Id");
    const name = getElementText(hotelEl, "Name");
    const cityId = getElementNumber(hotelEl, "CityId") || fallbackCityId;

    if (id && name && cityId) {
      const star = getElementText(hotelEl, "Star") || undefined;
      const categoryTitle = getElementText(hotelEl, "CategoryTitle") || undefined;
      const address = getElementText(hotelEl, "Address") || undefined;
      const longitude = getElementText(hotelEl, "Longitude") || undefined;
      const latitude = getElementText(hotelEl, "Latitude") || undefined;
      const image = getElementText(hotelEl, "Image") || undefined;
      const note = getElementText(hotelEl, "Note") || undefined;

      hotels.push({
        id,
        name,
        cityId,
        star,
        categoryTitle,
        address,
        longitude,
        latitude,
        image,
        note,
      });
    }
  });

  return hotels;
};

// Parse HotelSearch response
export const parseHotelSearchResponse = (xmlString: string): MyGoSearchResponse => {
  // Sanitize and validate XML format
  const sanitized = sanitizeXml(xmlString);
  validateXmlFormat(sanitized, "HotelSearch");
  
  const doc = parseXmlToObject(sanitized);
  if (!doc) {
    const preview = sanitized.slice(0, 200);
    throw new Error(`Failed to parse HotelSearch XML response. Preview: ${preview}`);
  }

  const root = doc.documentElement;
  const token = getElementText(root, "Token");
  
  if (!token) {
    throw new Error("Token not found in HotelSearch response");
  }

  const hotels: MyGoHotelSearchResult[] = [];
  const hotelElements = doc.querySelectorAll("Hotel");
  
  hotelElements.forEach((hotelEl: any) => {
    const id = getElementNumber(hotelEl, "Id");
    const name = getElementText(hotelEl, "Name");
    const available = getElementBoolean(hotelEl, "Available");
    
    const rooms: MyGoRoomResult[] = [];
    const roomElements = hotelEl.querySelectorAll("Room");
    
    roomElements.forEach((roomEl: any) => {
      const onRequest = getElementBoolean(roomEl, "OnRequest");
      const priceText = getElementText(roomEl, "Price");
      const price = priceText ? parseFloat(priceText) : undefined;
      
      // Extract all room data
      const roomData: MyGoRoomResult = {
        onRequest,
        price,
      };
      
      // Add other room fields dynamically
      Array.from(roomEl.children).forEach((child: any) => {
        const tagName = child.tagName;
        if (tagName !== "OnRequest" && tagName !== "Price") {
          roomData[tagName] = child.textContent?.trim() ?? "";
        }
      });
      
      rooms.push(roomData);
    });
    
    if (id && name) {
      const hotelData: MyGoHotelSearchResult = {
        id,
        name,
        available,
        rooms,
      };
      
      // Add other hotel fields dynamically
      Array.from(hotelEl.children).forEach((child: any) => {
        const tagName = child.tagName;
        if (tagName !== "Id" && tagName !== "Name" && tagName !== "Available" && tagName !== "Room") {
          hotelData[tagName] = child.textContent?.trim() ?? "";
        }
      });
      
      hotels.push(hotelData);
    }
  });

  return { token, hotels };
};

// Parse BookingCreation response
export const parseBookingCreationResponse = (xmlString: string): MyGoBookingResponse => {
  // Sanitize and validate XML format
  const sanitized = sanitizeXml(xmlString);
  validateXmlFormat(sanitized, "BookingCreation");
  
  const doc = parseXmlToObject(sanitized);
  if (!doc) {
    const preview = sanitized.slice(0, 200);
    throw new Error(`Failed to parse BookingCreation XML response. Preview: ${preview}`);
  }

  const root = doc.documentElement;
  const bookingIdText = getElementText(root, "BookingId");
  const bookingId = bookingIdText ? parseInt(bookingIdText, 10) : undefined;
  const state = getElementText(root, "State") || undefined;
  const totalPriceText = getElementText(root, "TotalPrice");
  const totalPrice = totalPriceText ? parseFloat(totalPriceText) : undefined;
  
  const response: MyGoBookingResponse = {
    bookingId,
    state,
    totalPrice,
  };
  
  // Add other fields dynamically
  Array.from(root.children).forEach((child: any) => {
    const tagName = child.tagName;
    if (tagName !== "BookingId" && tagName !== "State" && tagName !== "TotalPrice") {
      response[tagName] = child.textContent?.trim() ?? "";
    }
  });

  return response;
};

// POST XML to MyGo API
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
  const data = await postJson("HotelSearch", buildHotelSearchPayload(credential, params));

  const errorMessage = (data as { ErrorMessage?: { Code?: unknown; Description?: unknown } })
    .ErrorMessage;
  if (errorMessage?.Code) {
    throw new Error(
      `MyGo HotelSearch error ${errorMessage.Code}: ${errorMessage.Description}`,
    );
  }

  const searchId = (data as { SearchId?: unknown }).SearchId;
  if (typeof searchId !== "string" || !searchId) {
    throw new Error("MyGo HotelSearch response missing SearchId");
  }

  const hotelsJson = Array.isArray((data as { HotelSearch?: unknown }).HotelSearch)
    ? ((data as { HotelSearch: MyGoHotelSearchJson[] }).HotelSearch)
    : [];

  const hotels: MyGoHotelSearchResult[] = [];

  hotelsJson.forEach((hotel) => {
    const idValue = hotel.Id;
    const id = typeof idValue === "number" ? idValue : Number(idValue);
    const name = typeof hotel.Name === "string" ? hotel.Name : "";
    if (!Number.isFinite(id) || id === 0 || !name) {
      return;
    }

    const roomsJson = Array.isArray(hotel.Rooms) ? hotel.Rooms : [];
    const rooms: MyGoRoomResult[] = roomsJson.map((room) => ({
      ...room,
      onRequest: room.OnRequest === true,
      price: room.Price ?? undefined,
    }));

    const hotelResult: MyGoHotelSearchResult = {
      id,
      name,
      available: hotel.Available === true,
      rooms,
    };

    Object.entries(hotel).forEach(([key, value]) => {
      if (key !== "Id" && key !== "Name" && key !== "Available" && key !== "Rooms") {
        hotelResult[key] = value;
      }
    });

    hotels.push(hotelResult);
  });

  return { token: searchId, hotels };
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
    const rooms = hotel.rooms.filter((room) => room.price != null);
    const hasInstantConfirmation = rooms.some((room) => room.onRequest === false);
    return {
      ...hotel,
      rooms,
      hasInstantConfirmation,
    };
  });
};
