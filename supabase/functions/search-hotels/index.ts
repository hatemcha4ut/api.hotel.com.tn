import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { escapeXml, parseXmlResponse } from "./xml.ts";

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

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
};

type SearchPayload = {
  cityId?: string | number;
  checkIn?: string;
  checkOut?: string;
  adults?: string | number;
  children?: number[] | string[];
  hotelName?: string;
  onlyAvailable?: boolean;
};

type CityLookup = {
  mygo_id: string;
  name: string | null;
};

const buildHotelSearchXml = (
  login: string,
  password: string,
  cityId: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number[],
  hotelName: string,
  onlyAvailable: boolean,
) => {
  const childrenXml = children.map((child) =>
    `        <Child>${escapeXml(child.toString())}</Child>`
  ).join("\n");
  const keywordValue = hotelName ? escapeXml(hotelName) : "";
  const childrenBlock = childrenXml ? `${childrenXml}\n` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<HotelSearch>
  <Credential>
    <Login>${escapeXml(login)}</Login>
    <Password>${escapeXml(password)}</Password>
  </Credential>
  <SearchDetails>
    <BookingDetails>
      <CheckIn>${escapeXml(checkIn)}</CheckIn>
      <CheckOut>${escapeXml(checkOut)}</CheckOut>
      <City>${escapeXml(cityId)}</City>
    </BookingDetails>
    <Filters>
      <Keywords>${keywordValue}</Keywords>
      <OnlyAvailable>${onlyAvailable ? "true" : "false"}</OnlyAvailable>
    </Filters>
    <Rooms>
      <Room>
        <Adult>${escapeXml(adults.toString())}</Adult>
${childrenBlock}      </Room>
    </Rooms>
  </SearchDetails>
</HotelSearch>`;
};

const buildAuthHeader = (login: string, password: string) =>
  `Basic ${btoa(`${login}:${password}`)}`;

const resolveCity = async (
  supabase: ReturnType<typeof createClient>,
  cityId: string,
): Promise<CityLookup | null> => {
  const { data: byMygoId, error: mygoError } = await supabase
    .from("mygo_cities")
    .select("mygo_id,name")
    .eq("mygo_id", cityId)
    .maybeSingle();

  if (mygoError) {
    throw new Error(mygoError.message);
  }

  if (byMygoId) {
    return byMygoId as CityLookup;
  }

  if (/^\d+$/.test(cityId)) {
    const { data: byId, error: idError } = await supabase
      .from("mygo_cities")
      .select("mygo_id,name")
      .eq("id", Number(cityId))
      .maybeSingle();
    if (idError) {
      throw new Error(idError.message);
    }
    if (byId) {
      return byId as CityLookup;
    }
  }

  const { data: byName, error: nameError } = await supabase
    .from("mygo_cities")
    .select("mygo_id,name")
    .ilike("name", cityId)
    .maybeSingle();

  if (nameError) {
    throw new Error(nameError.message);
  }

  return byName ? (byName as CityLookup) : null;
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

  let payload: SearchPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, allowedOrigin);
  }

  const cityInput = normalizeValue(payload.cityId);
  const checkIn = normalizeValue(payload.checkIn);
  const checkOut = normalizeValue(payload.checkOut);
  const adults = normalizeNumber(payload.adults);
  const hotelName = normalizeValue(payload.hotelName);
  const onlyAvailable = payload.onlyAvailable === true;

  const children = Array.isArray(payload.children)
    ? payload.children.map((child) => normalizeNumber(child)).filter((child) =>
      child > 0
    )
    : [];

  if (!cityInput || !checkIn || !checkOut || adults <= 0) {
    return jsonResponse(
      { error: "Missing required search parameters" },
      400,
      allowedOrigin,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  const mygoLogin = Deno.env.get("MYGO_LOGIN");
  const mygoPassword = Deno.env.get("MYGO_PASSWORD");

  if (!supabaseUrl || !supabaseKey || !mygoLogin || !mygoPassword) {
    return jsonResponse(
      { error: "Missing required configuration" },
      500,
      allowedOrigin,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  let city: CityLookup | null = null;
  try {
    city = await resolveCity(supabase, cityInput);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "City lookup failed" },
      502,
      allowedOrigin,
    );
  }

  if (!city) {
    return jsonResponse(
      { error: "City not found" },
      404,
      allowedOrigin,
    );
  }

  const requestXml = buildHotelSearchXml(
    mygoLogin,
    mygoPassword,
    city.mygo_id,
    checkIn,
    checkOut,
    adults,
    children,
    hotelName,
    onlyAvailable,
  );

  let response: Response;
  try {
    response = await fetch(`${MYGO_ENDPOINT}/HotelSearch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Authorization: buildAuthHeader(mygoLogin, mygoPassword),
      },
      body: requestXml,
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
    const parsedError = parseXmlResponse(
      responseText,
      ["HotelSearchResult", "HotelSearchResponse"],
      ["Hotel", "HotelInfo", "HotelResult", "HotelItem", "Table"],
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
    ["HotelSearchResult", "HotelSearchResponse"],
    ["Hotel", "hotel", "HotelInfo", "HotelResult", "HotelItem", "Table"],
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

  return jsonResponse(parsed.items, 200, allowedOrigin);
});
