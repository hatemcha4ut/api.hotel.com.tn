import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const HOTEL_SEARCH_ENDPOINT = "https://admin.mygo.co/api/hotel/HotelSearch";

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
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? corsHeaders(origin) : {}),
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

const buildCredentialXml = (login: string, password: string) =>
  `<Credential>
    <Login>${escapeXml(login)}</Login>
    <Password>${escapeXml(password)}</Password>
  </Credential>`;

const buildHotelSearchBody = (
  login: string,
  password: string,
  cityId: string,
  checkIn: string,
  checkOut: string,
  occupancy: string,
) =>
  `<?xml version="1.0" encoding="utf-8"?>
<HotelSearch>
  ${buildCredentialXml(login, password)}
  <SearchDetails>
    <CityId>${escapeXml(cityId)}</CityId>
    <CheckIn>${escapeXml(checkIn)}</CheckIn>
    <CheckOut>${escapeXml(checkOut)}</CheckOut>
  </SearchDetails>
  <BookingDetails>
    <Occupancy>${escapeXml(occupancy)}</Occupancy>
  </BookingDetails>
</HotelSearch>`;

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

const extractXmlError = (document: Document) => {
  const errorTags = ["Error", "error", "ErrorMessage", "Message"];
  for (const tag of errorTags) {
    const node = document.getElementsByTagName(tag)[0];
    const text = node?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  return "";
};

const parseHotelSearchResponse = (
  xml: string,
): { error?: string; hotels?: Record<string, unknown>[] } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document || document.getElementsByTagName("parsererror").length > 0) {
    return { error: "Unable to parse XML response" };
  }

  const errorMessage = extractXmlError(document);
  if (errorMessage) {
    return { error: errorMessage };
  }

  return { hotels: extractHotels(document) };
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
    city_name?: string;
    check_in?: string;
    check_out?: string;
    occupancy?: string | number;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const cityName = normalizeValue(payload.city_name);
  const checkIn = normalizeValue(payload.check_in);
  const checkOut = normalizeValue(payload.check_out);
  const occupancy = normalizeValue(payload.occupancy);

  if (!cityName || !checkIn || !checkOut || !occupancy) {
    return jsonResponse(
      { error: "Missing required search parameters" },
      400,
      allowedOrigin,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  const mygoLogin = Deno.env.get("MYGO_LOGIN");
  const mygoPassword = Deno.env.get("MYGO_PASSWORD");
  if (!supabaseUrl || !supabaseKey || !mygoLogin || !mygoPassword) {
    return jsonResponse(
      { error: "Missing configuration for search" },
      500,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: cityData, error: cityError } = await supabase
    .from("mygo_cities")
    .select("id, name")
    .eq("name", cityName)
    .limit(1)
    .maybeSingle();

  if (cityError) {
    return jsonResponse({ error: cityError.message }, 500, allowedOrigin);
  }

  if (!cityData?.id) {
    return jsonResponse(
      { error: "City not found in MyGo catalog" },
      404,
      allowedOrigin,
    );
  }

  const requestBody = buildHotelSearchBody(
    mygoLogin,
    mygoPassword,
    cityData.id,
    checkIn,
    checkOut,
    occupancy,
  );

  let response: Response;
  try {
    response = await fetch(HOTEL_SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: requestBody,
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
    const parsedError = parseHotelSearchResponse(responseText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return jsonResponse(
      { error: parsedError.error || `Search request failed (${statusLabel})` },
      502,
      allowedOrigin,
    );
  }

  const parsed = parseHotelSearchResponse(responseText);
  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 502, allowedOrigin);
  }

  if (!parsed.hotels) {
    return jsonResponse(
      { error: "Invalid search response structure" },
      502,
      allowedOrigin,
    );
  }

  return jsonResponse(parsed.hotels, 200, allowedOrigin);
});
