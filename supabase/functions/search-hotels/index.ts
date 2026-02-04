import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SOAP_ENDPOINT = "http://api.mygo.tn/HotelService.asmx";
const SOAP_ACTION = "http://tempuri.org/Search";

const allowedOrigins = new Set([
  "https://www.hotel.com.tn",
  "https://admin.hotel.com.tn",
]);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
});

const jsonResponse = (
  body: Record<string, unknown> | unknown[],
  status: number,
  origin?: string,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });

const normalizeValue = (value: unknown) => {
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

const decodeXmlEntities = (value: string) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");

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

type XmlNode = Document | Element;

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
      result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
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

const extractHotels = (root: XmlNode): Record<string, unknown>[] => {
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

const parseSoapResponse = (xml: string) => {
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

  let root: XmlNode = document;
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
    return new Response("Origin not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
    });
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
        SOAPAction: SOAP_ACTION,
      },
      body: soapEnvelope,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to reach SOAP API" },
      502,
      allowedOrigin,
    );
  }

  const responseText = await response.text();
  const parsed = parseSoapResponse(responseText);

  if (!response.ok) {
    return jsonResponse(
      { error: parsed.error || `SOAP request failed (${response.status})` },
      502,
      allowedOrigin,
    );
  }

  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 502, allowedOrigin);
  }

  return jsonResponse(parsed.hotels ?? [], 200, allowedOrigin);
});
