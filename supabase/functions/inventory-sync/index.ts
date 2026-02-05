import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
// import { requireAdmin } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { formatError, ValidationError } from "../_shared/errors.ts";
import { createSupplierClient } from "../_shared/suppliers/currentSupplierAdapter.ts";
import { buildListCityXml, MYGO_BASE_URL, type MyGoCredential } from "../_shared/lib/mygoClient.ts";

const PREVIEW_LENGTH = 300;

const myGoDiagnose = async () => {
  // Read credentials and return only their lengths (never the values)
  const login = (Deno.env.get("MYGO_LOGIN") ?? "").trim();
  const password = (Deno.env.get("MYGO_PASSWORD") ?? "").trim();
  
  const loginLength = login.length;
  const passwordLength = password.length;

  // Build the ListCity XML request using existing function
  const credential: MyGoCredential = { login, password };
  const xml = buildListCityXml(credential);
  
  // Call MyGo API directly without parsing
  const url = `${MYGO_BASE_URL}/ListCity`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: xml,
  });

  // Get raw response text (do not parse XML)
  const text = await response.text();
  
  // Return diagnostic information
  return {
    loginLength,
    passwordLength,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    preview: text.trim().slice(0, PREVIEW_LENGTH),
  };
};

const syncCities = async (
  supabase: ReturnType<typeof createClient>,
) => {
  const supplierClient = createSupplierClient();
  const cities = await supplierClient.fetchCities();

  if (!cities || cities.length === 0) {
    return { processed: 0 };
  }

  const citiesData = cities.map((city) => ({
    id: city.id,
    name: city.name,
    region: city.region ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("inventory_cities")
    .upsert(citiesData, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to sync cities: ${error.message}`);
  }

  return {
    processed: cities.length,
  };
};

const syncHotels = async (
  supabase: ReturnType<typeof createClient>,
) => {
  const supplierClient = createSupplierClient();
  const cities = await supplierClient.fetchCities();

  if (!cities || cities.length === 0) {
    return { processed: 0 };
  }

  const hotelsData: Array<Record<string, unknown>> = [];

  for (const city of cities) {
    const hotels = await supplierClient.fetchHotels(city.id);

    if (!hotels || hotels.length === 0) {
      continue;
    }

    hotelsData.push(
      ...hotels.map((hotel) => ({
        id: hotel.id,
        name: hotel.name,
        city_id: hotel.cityId ?? city.id,
        star: hotel.star ?? null,
        category_title: hotel.categoryTitle ?? null,
        address: hotel.address ?? null,
        longitude: hotel.longitude ?? null,
        latitude: hotel.latitude ?? null,
        image: hotel.image ?? null,
        note: hotel.note ?? null,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  if (hotelsData.length === 0) {
    return { processed: 0 };
  }

  const { error } = await supabase
    .from("inventory_hotels")
    .upsert(hotelsData, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to sync hotels: ${error.message}`);
  }

  return {
    processed: hotelsData.length,
  };
};

serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // TEMP: pas de requireAdmin pendant les tests
    // await requireAdmin(request);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ValidationError("Invalid JSON payload");
    }

    if (!payload || typeof payload !== "object") {
      throw new ValidationError("Request body must be an object");
    }

    const body = payload as Record<string, unknown>;
    const action =
      typeof body.action === "string" ? body.action.toLowerCase() : "";

    if (!action) {
      throw new ValidationError("Missing action parameter");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case "mygo_diagnose": {
        const result = await myGoDiagnose();
        return jsonResponse(
          {
            success: true,
            action: "mygo_diagnose",
            ...result,
          },
          200,
        );
      }
      case "cities": {
        const result = await syncCities(supabase);
        return jsonResponse(
          {
            success: true,
            action: "cities",
            ...result,
          },
          200,
        );
      }
      case "hotels": {
        const result = await syncHotels(supabase);
        return jsonResponse(
          {
            success: true,
            action: "hotels",
            ...result,
          },
          200,
        );
      }
      default:
        throw new ValidationError(
          `Unknown action: ${action}. Valid actions: mygo_diagnose, cities, hotels`,
        );
    }
  } catch (error) {
    console.error("Inventory sync error:", error);

    const errorResponse = formatError(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;

    return jsonResponse(errorResponse, statusCode);
  }
});
