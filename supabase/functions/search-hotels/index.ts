import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// MyGo SOAP endpoint uses HTTP; no HTTPS endpoint is available for this API.
// The API also provides no request-level auth or signing for the search action.
// Only non-sensitive search parameters are sent to this endpoint.
// Apply rate limiting upstream to reduce exposure over HTTP.
const SOAP_ENDPOINT = "http://api.mygo.tn/HotelService.asmx";
const SOAP_ACTION = "http://tempuri.org/Search";

const allowedOrigins = new Set([
  "https://www.hotel.com.tn",
  "https://admin.hotel.com.tn",
]);

const corsHeaders = (origin: string) =>
  allowedOrigins.has(origin)
    ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Vary": "Origin",
    }
    : {};

const jsonResponse = (
  body: Record<string, unknown> | unknown[],
  status: number,
  origin?: string,
  cacheControl?: string,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    },
  });

const normalizeValue = (value: unknown) => {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return "";
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const decodeXmlEntities = (value: string) => {
  const decodedWithoutAmpersand = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  // Decode ampersand last to avoid double-decoding.
  return decodedWithoutAmpersand.replaceAll("&amp;", "&");
};

const buildSoapEnvelope = (
  cityId: string,
  checkIn: string,
  checkOut: string,
  occupancy: string,
) =>
  `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Search xmlns="http://tempuri.org/">
      <cityId>${escapeXml(cityId)}</cityId>
      <checkIn>${escapeXml(checkIn)}</checkIn>
      <checkOut>${escapeXml(checkOut)}</checkOut>
      <occupancy>${escapeXml(occupancy)}</occupancy>
    </Search>
  </soap:Body>
</soap:Envelope>`;

type XmlContainer = Document | Element;

const elementToObject = (element: Element): Record<string, unknown> => {
  const children = Array.from(element.children);
  if (!children.length) {
    return { value: element.textContent?.trim() ?? "" };
  }
  return children.reduce<Record<string, unknown>>((result, child) => {
    const key = child.tagName;
    const value =
      child.children.length > 0
        ? elementToObject(child)
        : child.textContent?.trim() ?? "";
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
    return result;
  }, {});
};

const parseEmbeddedXml = (content: string) => {
  const decoded = decodeXmlEntities(content);
  if (!decoded.includes("<")) {
    return null;
  }
  const parsed = new DOMParser().parseFromString(decoded, "application/xml");
  if (!parsed || parsed.getElementsByTagName("parsererror").length > 0) {
    return null;
  }
  return parsed;
};

const extractHotels = (root: XmlContainer): Record<string, unknown>[] => {
  const candidates = [
    "Hotel",
    "hotel",
    "HotelInfo",
    "HotelResult",
    "HotelItem",
    "Table",
  ];
  for (const tag of candidates) {
    const nodes = Array.from(root.getElementsByTagName(tag));
    if (nodes.length) {
      return nodes.map((node) => elementToObject(node));
    }
  }

  const container = root instanceof Document ? root.documentElement : root;
  const directChildren = container ? Array.from(container.children) : [];
  // Fallback when no known hotel element tag is present in the response.
  return directChildren.map((node) => elementToObject(node));
};

// Sanitize hotel data by removing sensitive fields like tokens
// Token field is set to null for backward compatibility but marked as deprecated
const sanitizeHotels = (
  hotels: Record<string, unknown>[],
): Record<string, unknown>[] => {
  return hotels.map((hotel) => {
    // Create a shallow copy and remove/nullify token fields
    const sanitized = { ...hotel };
    // Remove any token-related fields that may exist in the SOAP response
    delete sanitized.token;
    delete sanitized.Token;
    delete sanitized.TOKEN;
    delete sanitized.searchToken;
    delete sanitized.SearchToken;
    delete sanitized.bookingToken;
    delete sanitized.BookingToken;
    
    // For backward compatibility, set token to null to indicate it's no longer provided
    // Frontend should not depend on this field - it's deprecated
    sanitized.token = null;
    
    return sanitized;
  });
};

const parseSoapResponse = (
  xml: string,
): { error?: string; hotels?: Record<string, unknown>[] } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document) {
    return { error: "Unable to parse SOAP response" };
  }

  const fault = document.getElementsByTagName("Fault")[0];
  if (fault) {
    const faultString = fault.getElementsByTagName("faultstring")[0]?.textContent
      ?.trim();
    return { error: faultString || "SOAP fault received" };
  }

  let root: XmlContainer = document;
  const searchResult = document.getElementsByTagName("SearchResult")[0];
  const searchContent = searchResult?.textContent?.trim();
  if (searchResult && searchContent) {
    const embedded = parseEmbeddedXml(searchContent);
    root = embedded ?? searchResult;
  }

  return { hotels: extractHotels(root) };
};

serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "";

  if (origin && !allowedOrigin) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
  }

  let payload: {
    cityId?: string | number;
    checkIn?: string;
    checkOut?: string;
    occupancy?: string | number;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const cityId = normalizeValue(payload.cityId);
  const checkIn = normalizeValue(payload.checkIn);
  const checkOut = normalizeValue(payload.checkOut);
  const occupancy = normalizeValue(payload.occupancy);

  if (!cityId || !checkIn || !checkOut || !occupancy) {
    return jsonResponse(
      { error: "Missing required search parameters" },
      400,
      allowedOrigin,
    );
  }

  const soapEnvelope = buildSoapEnvelope(cityId, checkIn, checkOut, occupancy);

  let response: Response;
  try {
    response = await fetch(SOAP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${SOAP_ACTION}"`,
      },
      body: soapEnvelope,
    });
  } catch {
    return jsonResponse(
      { error: "Failed to connect to hotel search service" },
      502,
      allowedOrigin,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    const parsedError = parseSoapResponse(responseText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return jsonResponse(
      { error: parsedError.error || `SOAP request failed (${statusLabel})` },
      502,
      allowedOrigin,
    );
  }

  const parsed = parseSoapResponse(responseText);
  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 502, allowedOrigin);
  }

  if (!parsed.hotels) {
    return jsonResponse(
      { error: "Invalid SOAP response structure" },
      502,
      allowedOrigin,
    );
  }

  // Sanitize hotels to remove token fields before returning
  // This ensures tokens are never exposed in the public, cacheable response
  const sanitizedHotels = sanitizeHotels(parsed.hotels);

  // Return sanitized hotels with cache headers (120 seconds as per requirements)
  return jsonResponse(
    sanitizedHotels,
    200,
    allowedOrigin,
    "public, max-age=120",
  );
});
