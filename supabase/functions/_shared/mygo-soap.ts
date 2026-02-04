// MyGo SOAP API utilities
// This module provides functions to interact with MyGo's hotel booking SOAP API

const SOAP_ENDPOINT = "http://api.mygo.tn/HotelService.asmx";

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
  return decodedWithoutAmpersand.replaceAll("&amp;", "&");
};

export interface HotelSearchParams {
  cityId: string;
  checkIn: string;
  checkOut: string;
  occupancy: string;
}

export interface HotelSearchResult {
  token?: string;
  hotels: Record<string, unknown>[];
}

// Build SOAP envelope for HotelSearch operation
const buildSearchEnvelope = (params: HotelSearchParams) =>
  `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Search xmlns="http://tempuri.org/">
      <cityId>${escapeXml(params.cityId)}</cityId>
      <checkIn>${escapeXml(params.checkIn)}</checkIn>
      <checkOut>${escapeXml(params.checkOut)}</checkOut>
      <occupancy>${escapeXml(params.occupancy)}</occupancy>
    </Search>
  </soap:Body>
</soap:Envelope>`;

// Build SOAP envelope for BookingCreation operation
export const buildBookingEnvelope = (
  token: string,
  bookingData: Record<string, unknown>,
) =>
  `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <BookingCreation xmlns="http://tempuri.org/">
      <token>${escapeXml(token)}</token>
      <PreBooking>true</PreBooking>
      <bookingData>${escapeXml(JSON.stringify(bookingData))}</bookingData>
    </BookingCreation>
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

const extractToken = (root: XmlContainer): string | undefined => {
  // Search for token in common tag names
  const tokenTags = ["token", "Token", "TOKEN", "SearchToken", "searchToken"];
  for (const tag of tokenTags) {
    const tokenElement = root.getElementsByTagName(tag)[0];
    if (tokenElement) {
      const tokenValue = tokenElement.textContent?.trim();
      if (tokenValue) {
        return tokenValue;
      }
    }
  }
  return undefined;
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
  return directChildren.map((node) => elementToObject(node));
};

const parseSearchResponse = (
  xml: string,
): { error?: string; result?: HotelSearchResult } => {
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

  const token = extractToken(root);
  const hotels = extractHotels(root);

  return { result: { token, hotels } };
};

// Call MyGo HotelSearch SOAP endpoint
// This function is used internally by create-booking to get a fresh token
export const callHotelSearch = async (
  params: HotelSearchParams,
): Promise<{ error?: string; result?: HotelSearchResult }> => {
  const soapEnvelope = buildSearchEnvelope(params);

  let response: Response;
  try {
    response = await fetch(SOAP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '"http://tempuri.org/Search"',
      },
      body: soapEnvelope,
    });
  } catch (error) {
    return {
      error: `Failed to connect to MyGo service: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }

  const responseText = await response.text();
  if (!response.ok) {
    const parsed = parseSearchResponse(responseText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return {
      error: parsed.error || `MyGo search request failed (${statusLabel})`,
    };
  }

  return parseSearchResponse(responseText);
};

const parseBookingResponse = (
  xml: string,
): { error?: string; bookingReference?: string } => {
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

  // Extract booking reference from response
  const bookingRefTags = [
    "BookingReference",
    "bookingReference",
    "Reference",
    "reference",
    "BookingCreationResult",
  ];
  for (const tag of bookingRefTags) {
    const refElement = document.getElementsByTagName(tag)[0];
    if (refElement) {
      const refValue = refElement.textContent?.trim();
      if (refValue) {
        return { bookingReference: refValue };
      }
    }
  }

  return { error: "Booking reference not found in response" };
};

// Call MyGo BookingCreation SOAP endpoint with PreBooking=true
export const callBookingCreation = async (
  token: string,
  bookingData: Record<string, unknown>,
): Promise<{ error?: string; bookingReference?: string }> => {
  const soapEnvelope = buildBookingEnvelope(token, bookingData);

  let response: Response;
  try {
    response = await fetch(SOAP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '"http://tempuri.org/BookingCreation"',
      },
      body: soapEnvelope,
    });
  } catch (error) {
    return {
      error: `Failed to connect to MyGo service: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }

  const responseText = await response.text();
  if (!response.ok) {
    const parsed = parseBookingResponse(responseText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return {
      error: parsed.error || `MyGo booking request failed (${statusLabel})`,
    };
  }

  return parseBookingResponse(responseText);
};

// Hash token with SHA-256 for secure storage
// Only the hash should be stored in the database, never the plain token
export const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
