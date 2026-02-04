import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MYGO_ENDPOINT = "https://admin.mygo.co/api/hotel";

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

type XmlContainer = Document | Element;

type CityRecord = {
  mygo_id: string;
  name: string | null;
  country: string | null;
  raw_payload: Record<string, unknown>;
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

const extractItems = (
  root: XmlContainer,
  tags: string[],
): Record<string, unknown>[] => {
  for (const tag of tags) {
    const nodes = Array.from(root.getElementsByTagName(tag));
    if (nodes.length) {
      return nodes.map((node) => elementToObject(node));
    }
  }

  const container = root instanceof Document ? root.documentElement : root;
  const directChildren = container ? Array.from(container.children) : [];
  return directChildren.map((node) => elementToObject(node));
};

const findResultNode = (document: Document, tags: string[]) => {
  for (const tag of tags) {
    const node = document.getElementsByTagName(tag)[0];
    if (node) {
      return node;
    }
  }
  return null;
};

const parseXmlResponse = (
  xml: string,
  resultTags: string[],
  itemTags: string[],
): { error?: string; items?: Record<string, unknown>[] } => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document || document.getElementsByTagName("parsererror").length > 0) {
    return { error: "Unable to parse XML response" };
  }

  const errorNode = document.getElementsByTagName("Error")[0] ??
    document.getElementsByTagName("Fault")[0];
  const faultString = document.getElementsByTagName("faultstring")[0];
  const message = errorNode?.textContent?.trim() ??
    faultString?.textContent?.trim();
  if (message) {
    return { error: message };
  }

  let root: XmlContainer = document;
  const resultNode = findResultNode(document, resultTags);
  const resultContent = resultNode?.textContent?.trim();
  if (resultNode) {
    const embedded = resultContent ? parseEmbeddedXml(resultContent) : null;
    root = embedded ?? resultNode;
  }

  return { items: extractItems(root, itemTags) };
};

const buildAuthHeader = (login: string, password: string) =>
  `Basic ${btoa(`${login}:${password}`)}`;

const buildListCityXml = (login: string, password: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<ListCity>
  <Credential>
    <Login>${escapeXml(login)}</Login>
    <Password>${escapeXml(password)}</Password>
  </Credential>
</ListCity>`;

const extractValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "object" && value && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    return typeof nested === "string" ? nested.trim() : "";
  }
  return "";
};

const buildCityRecord = (item: Record<string, unknown>): CityRecord | null => {
  const idValue =
    extractValue(item.CityId) ||
    extractValue(item.CityID) ||
    extractValue(item.Id) ||
    extractValue(item.ID) ||
    extractValue(item.CityCode) ||
    extractValue(item.Code);
  const nameValue =
    extractValue(item.CityName) ||
    extractValue(item.Name) ||
    extractValue(item.City) ||
    extractValue(item.Label);
  const countryValue =
    extractValue(item.Country) ||
    extractValue(item.CountryName) ||
    extractValue(item.CountryCode);

  if (!idValue) {
    return null;
  }

  return {
    mygo_id: idValue,
    name: nameValue || null,
    country: countryValue || null,
    raw_payload: item,
  };
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

  if (!supabaseUrl || !supabaseKey || !mygoLogin || !mygoPassword) {
    return jsonResponse(
      { error: "Missing required configuration" },
      500,
      allowedOrigin,
    );
  }

  const listCityXml = buildListCityXml(mygoLogin, mygoPassword);

  let response: Response;
  try {
    response = await fetch(`${MYGO_ENDPOINT}/ListCity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Authorization: buildAuthHeader(mygoLogin, mygoPassword),
      },
      body: listCityXml,
    });
  } catch {
    return jsonResponse(
      { error: "Failed to connect to city list service" },
      502,
      allowedOrigin,
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    const parsedError = parseXmlResponse(
      responseText,
      ["ListCityResult", "ListCityResponse"],
      ["City", "CityInfo", "CityItem", "Table"],
    );
    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return jsonResponse(
      {
        error: parsedError.error || `XML request failed (${statusLabel})`,
      },
      502,
      allowedOrigin,
    );
  }

  const parsed = parseXmlResponse(
    responseText,
    ["ListCityResult", "ListCityResponse"],
    ["City", "city", "CityInfo", "CityItem", "Table"],
  );

  if (parsed.error) {
    return jsonResponse({ error: parsed.error }, 502, allowedOrigin);
  }

  if (!parsed.items) {
    return jsonResponse(
      { error: "Invalid XML response structure" },
      502,
      allowedOrigin,
    );
  }

  const cityRecords = parsed.items
    .map((item) => buildCityRecord(item))
    .filter((item): item is CityRecord => item !== null);

  if (!cityRecords.length) {
    return jsonResponse(
      { error: "No cities found in response" },
      502,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("mygo_cities")
    .upsert(cityRecords, { onConflict: "mygo_id" })
    .select("mygo_id,name,country");

  if (error) {
    return jsonResponse({ error: error.message }, 500, allowedOrigin);
  }

  return jsonResponse(
    {
      synced: data?.length ?? 0,
      cities: data ?? [],
    },
    200,
    allowedOrigin,
  );
});
