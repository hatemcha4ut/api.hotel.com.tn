import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const API_BASE_URL = "https://admin.mygo.co/api/hotel/";

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

const buildRoot = (login: string, password: string, body = "") =>
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

const extractElements = (document: Document, tagName: string) => {
  const nodes = Array.from(document.getElementsByTagName(tagName));
  if (nodes.length) {
    return nodes.map((node) => elementToObject(node));
  }
  const decoded = document.documentElement?.textContent?.trim();
  if (decoded) {
    const embedded = parseXml(decodeXmlEntities(decoded));
    if (embedded) {
      return extractElements(embedded, tagName);
    }
  }
  return [];
};

const toNumber = (value: unknown) => {
  const parsed = Number(normalizeValue(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const toText = (value: unknown) => normalizeValue(value) || null;

const mapCity = (value: Record<string, unknown>) => ({
  id: toText(value.CityId ?? value.ID ?? value.Id ?? value.id),
  name: toText(value.CityName ?? value.Name ?? value.name ?? value.City),
  region: toText(value.Region ?? value.RegionName ?? value.region),
});

const mapHotel = (value: Record<string, unknown>) => ({
  id: toText(value.HotelId ?? value.ID ?? value.Id ?? value.id),
  name: toText(value.HotelName ?? value.Name ?? value.name),
  city_id: toText(value.CityId ?? value.CityID ?? value.city_id),
  stars: toNumber(value.Stars ?? value.Star ?? value.star),
  category: toText(value.Category ?? value.category),
  image_url: toText(value.ImageUrl ?? value.ImageURL ?? value.image_url),
});

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
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
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

  let payload: { action?: string; cityId?: string | number };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const action = normalizeValue(payload.action);
  if (action !== "cities" && action !== "hotels") {
    return jsonResponse(
      { error: "Invalid action" },
      400,
      allowedOrigin,
    );
  }

  const cityId = normalizeValue(payload.cityId);
  const requestBody = buildRoot(
    mygoLogin,
    mygoPassword,
    action === "hotels" && cityId
      ? `<CityId>${escapeXml(cityId)}</CityId>`
      : "",
  );

  const endpoint = `${API_BASE_URL}${
    action === "cities" ? "ListCity" : "ListHotel"
  }`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: requestBody,
    });
  } catch {
    return jsonResponse(
      { error: "Failed to connect to MyGo API" },
      502,
      allowedOrigin,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    return jsonResponse(
      { error: `MyGo request failed (${response.status})` },
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

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (action === "cities") {
    const items = extractElements(parsed, "City");
    const rows = items.map(mapCity).filter((row) => row.id && row.name);
    if (!rows.length) {
      return jsonResponse([], 200, allowedOrigin);
    }
    const { error } = await supabase
      .from("mygo_cities")
      .upsert(rows, { onConflict: "id" });
    if (error) {
      return jsonResponse({ error: error.message }, 400, allowedOrigin);
    }
    return jsonResponse(rows, 200, allowedOrigin);
  }

  const items = extractElements(parsed, "Hotel");
  const rows = items.map(mapHotel).filter((row) => row.id && row.name);
  if (!rows.length) {
    return jsonResponse([], 200, allowedOrigin);
  }
  const { error } = await supabase
    .from("mygo_hotels")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    return jsonResponse({ error: error.message }, 400, allowedOrigin);
  }
  return jsonResponse(rows, 200, allowedOrigin);
});
