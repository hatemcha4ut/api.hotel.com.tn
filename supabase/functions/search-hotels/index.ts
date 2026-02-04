import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE_URL = "https://admin.mygo.co/api/hotel/";
const DEFAULT_ROOMS = "1";
const DEFAULT_ADULTS = "2";
const DEFAULT_CHILDREN = "0";

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

const decodeXmlEntities = (value: string) => {
  const decodedWithoutAmpersand = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  return decodedWithoutAmpersand.replaceAll("&amp;", "&");
};

const normalizeDate = (value: string) => {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
};

const buildRoot = (login: string, password: string, body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<root>
  <login>${escapeXml(login)}</login>
  <password>${escapeXml(password)}</password>
  ${body}
</root>`;

const parseXml = (xml: string) => {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (!parsed || parsed.getElementsByTagName("parsererror").length > 0) {
    return null;
  }
  return parsed;
};

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

const parseHotelSearch = (document: Document) => {
  const errorNode = document.getElementsByTagName("Error")[0];
  if (errorNode) {
    const message = errorNode.textContent?.trim();
    if (message) {
      return { error: message };
    }
  }

  const hotelNodes = Array.from(
    document.getElementsByTagName("Hotel"),
  );
  if (hotelNodes.length) {
    return { hotels: hotelNodes.map((node) => elementToObject(node)) };
  }

  const responseNode = document.getElementsByTagName("HotelSearchResponse")[0] ??
    document.documentElement;
  const decoded = responseNode?.textContent?.trim();
  if (decoded) {
    const embedded = parseXml(decodeXmlEntities(decoded));
    if (embedded) {
      return parseHotelSearch(embedded);
    }
  }

  const fallbackNodes = Array.from(
    document.getElementsByTagName("HotelInfo"),
  );
  if (fallbackNodes.length) {
    return { hotels: fallbackNodes.map((node) => elementToObject(node)) };
  }

  return { hotels: [] };
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mygoLogin = Deno.env.get("MYGO_LOGIN");
  const mygoPassword = Deno.env.get("MYGO_PASSWORD");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
      allowedOrigin,
    );
  }
  if (!mygoLogin || !mygoPassword) {
    return jsonResponse(
      { error: "MyGo credentials missing" },
      500,
      allowedOrigin,
    );
  }

  let payload: {
    city_name?: string;
    check_in?: string;
    check_out?: string;
    adults?: number;
    children?: number;
    rooms?: number;
  };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const cityName = normalizeValue(payload.city_name);
  const checkIn = normalizeDate(normalizeValue(payload.check_in));
  const checkOut = normalizeDate(normalizeValue(payload.check_out));
  const rooms = normalizeValue(payload.rooms ?? DEFAULT_ROOMS);
  const adults = normalizeValue(payload.adults ?? DEFAULT_ADULTS);
  const children = normalizeValue(payload.children ?? DEFAULT_CHILDREN);

  if (!cityName || !checkIn || !checkOut) {
    return jsonResponse(
      { error: "Missing required search parameters" },
      400,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: cityData, error: cityError } = await supabase
    .from("mygo_cities")
    .select("id")
    .eq("name", cityName)
    .maybeSingle();

  if (cityError) {
    return jsonResponse({ error: cityError.message }, 500, allowedOrigin);
  }

  const cityId = normalizeValue(cityData?.id);
  if (!cityId) {
    return jsonResponse(
      { error: "City not found" },
      404,
      allowedOrigin,
    );
  }
  const requestBody = buildRoot(
    mygoLogin,
    mygoPassword,
    `<CityId>${escapeXml(cityId)}</CityId>
  <CheckIn>${escapeXml(checkIn)}</CheckIn>
  <CheckOut>${escapeXml(checkOut)}</CheckOut>
  <Rooms>${escapeXml(rooms)}</Rooms>
  <Adults>${escapeXml(adults)}</Adults>
  <Children>${escapeXml(children)}</Children>`,
  );

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}HotelSearch`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
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
    return jsonResponse(
      { error: `Hotel search request failed (${response.status})` },
      502,
      allowedOrigin,
    );
  }

  const parsed = parseXml(responseText);
  if (!parsed) {
    return jsonResponse(
      { error: "Invalid MyGo response" },
      502,
      allowedOrigin,
    );
  }

  const parsedHotels = parseHotelSearch(parsed);
  if (parsedHotels.error) {
    return jsonResponse(
      { error: parsedHotels.error },
      502,
      allowedOrigin,
    );
  }

  return jsonResponse(parsedHotels.hotels ?? [], 200, allowedOrigin);
});
