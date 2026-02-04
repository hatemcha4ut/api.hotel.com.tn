import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const LIST_CITY_ENDPOINT = "https://admin.mygo.co/api/hotel/ListCity";

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

const timingSafeEqual = (left: string, right: string) => {
  const leftLength = left.length;
  const rightLength = right.length;
  const maxLength = Math.max(leftLength, rightLength);
  let mismatchBits = leftLength ^ rightLength;
  for (let i = 0; i < maxLength; i += 1) {
    const leftChar = i < leftLength ? left.charCodeAt(i) : 0;
    const rightChar = i < rightLength ? right.charCodeAt(i) : 0;
    mismatchBits |= leftChar ^ rightChar;
  }
  return mismatchBits === 0;
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const buildListCityBody = (login: string, password: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<ListCity>
  <Credential>
    <Login>${escapeXml(login)}</Login>
    <Password>${escapeXml(password)}</Password>
  </Credential>
</ListCity>`;

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

const findValue = (element: Element, tags: string[]) => {
  for (const tag of tags) {
    const node = element.getElementsByTagName(tag)[0];
    const text = node?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  for (const tag of tags) {
    const attribute = element.getAttribute(tag);
    if (attribute?.trim()) {
      return attribute.trim();
    }
  }
  return "";
};

const extractCities = (document: Document) => {
  const candidates = ["City", "city", "CityInfo", "CityItem", "Table"];
  let nodes: Element[] = [];
  for (const tag of candidates) {
    const found = Array.from(document.getElementsByTagName(tag));
    if (found.length) {
      nodes = found;
      break;
    }
  }

  if (!nodes.length && document.documentElement) {
    nodes = Array.from(document.documentElement.children);
  }

  const cityIdTags = ["CityId", "CityID", "CityCode", "Id", "ID", "id"];
  const cityNameTags = ["CityName", "Name", "name", "City", "CITY_NAME"];

  const uniqueCities = new Map<string, { id: string; name: string }>();
  for (const node of nodes) {
    const id = findValue(node, cityIdTags);
    const name = findValue(node, cityNameTags);
    if (!id || !name) {
      continue;
    }
    if (!uniqueCities.has(id)) {
      uniqueCities.set(id, { id, name });
    }
  }
  return Array.from(uniqueCities.values());
};

const parseListCityResponse = (
  xml: string,
): { error?: string; cities?: { id: string; name: string }[] } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document || document.getElementsByTagName("parsererror").length > 0) {
    return { error: "Unable to parse XML response" };
  }

  const errorMessage = extractXmlError(document);
  if (errorMessage) {
    return { error: errorMessage };
  }

  return { cities: extractCities(document) };
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

  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mygoSyncToken = Deno.env.get("MYGO_SYNC_TOKEN");
  const mygoLogin = Deno.env.get("MYGO_LOGIN");
  const mygoPassword = Deno.env.get("MYGO_PASSWORD");
  if (
    !supabaseUrl || !supabaseKey || !mygoLogin || !mygoPassword ||
    !mygoSyncToken
  ) {
    return jsonResponse(
      { error: "Missing configuration for MyGo sync" },
      500,
      allowedOrigin,
    );
  }

  const bearerToken = authHeader.slice("Bearer ".length).trim();
  if (!timingSafeEqual(bearerToken, mygoSyncToken)) {
    return jsonResponse({ error: "Unauthorized" }, 401, allowedOrigin);
  }

  const requestBody = buildListCityBody(mygoLogin, mygoPassword);

  let response: Response;
  try {
    response = await fetch(LIST_CITY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: requestBody,
    });
  } catch {
    return jsonResponse(
      { error: "Failed to connect to MyGo city service" },
      502,
      allowedOrigin,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    const parsedError = parseListCityResponse(responseText);
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return jsonResponse(
      { error: parsedError.error || `City sync failed (${statusLabel})` },
      502,
      allowedOrigin,
    );
  }

  const parsed = parseListCityResponse(responseText);
  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 502, allowedOrigin);
  }

  if (!parsed.cities || parsed.cities.length === 0) {
    return jsonResponse(
      { error: "No cities returned from MyGo" },
      502,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const { error: upsertError } = await supabase
    .from("mygo_cities")
    .upsert(parsed.cities, { onConflict: "id" });

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500, allowedOrigin);
  }

  const keepIds = parsed.cities.map((city) => city.id);
  if (keepIds.length >= 10) {
    const { error: deleteError } = await supabase
      .from("mygo_cities")
      .delete()
      .not("id", "in", keepIds);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500, allowedOrigin);
    }
  }

  return jsonResponse(
    { synced: parsed.cities.length },
    200,
    allowedOrigin,
  );
});
