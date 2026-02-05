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
    
    if (id && name) {
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
        const preview = trimmed.slice(0, 400);
        throw new Error(
          `MyGo returned non-XML response for ${serviceName} (likely invalid credentials or blocked request): ${preview}`
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

// High-level API methods
export const listCities = async (credential: MyGoCredential): Promise<MyGoCity[]> => {
  const xml = buildListCityXml(credential);
  const responseXml = await postXml("ListCity", xml, { idempotent: true });
  return parseListCityResponse(responseXml);
};

export const listHotels = async (
  credential: MyGoCredential,
  cityId: number,
): Promise<MyGoHotel[]> => {
  const xml = buildListHotelXml(credential, cityId);
  const responseXml = await postXml("ListHotel", xml, { idempotent: true });
  return parseListHotelResponse(responseXml, cityId);
};

export const searchHotels = async (
  credential: MyGoCredential,
  params: MyGoSearchParams,
): Promise<MyGoSearchResponse> => {
  const xml = buildHotelSearchXml(credential, params);
  const responseXml = await postXml("HotelSearch", xml, { idempotent: true });
  return parseHotelSearchResponse(responseXml);
};

export const createBooking = async (
  credential: MyGoCredential,
  params: MyGoBookingParams,
): Promise<MyGoBookingResponse> => {
  const xml = buildBookingCreationXml(credential, params);
  // BookingCreation is NOT idempotent - no retries
  const responseXml = await postXml("BookingCreation", xml, { idempotent: false });
  return parseBookingCreationResponse(responseXml);
};

// Filter out non-bookable results
export const filterBookableHotels = (
  hotels: MyGoHotelSearchResult[],
): MyGoHotelSearchResult[] => {
  return hotels
    .filter((hotel) => hotel.available === true)
    .map((hotel) => ({
      ...hotel,
      rooms: hotel.rooms.filter((room) => room.onRequest === false),
    }))
    .filter((hotel) => hotel.rooms.length > 0);
};
