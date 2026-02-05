import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
// import { requireAdmin } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { formatError, ValidationError } from "../_shared/errors.ts";
import { createSupplierClient } from "../_shared/suppliers/currentSupplierAdapter.ts";
import { buildListCityXml } from "../_shared/lib/mygoClient.ts";

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

/**
 * Sanitizes XML body by redacting password field before creating a snippet.
 * 
 * Security: Performs sanitization on the full body BEFORE truncation to ensure
 * the password is never exposed, even if the password tag spans the snippet boundary.
 * 
 * @param fullXmlBody - Complete XML request body containing credentials
 * @param snippetLength - Number of characters to include in the returned snippet
 * @returns Sanitized XML snippet with password replaced by "***"
 */
const createSanitizedXmlSnippet = (fullXmlBody: string, snippetLength: number) => {
  // First, sanitize the password in the full body
  const PASSWORD_OPEN_TAG = "<Password>";
  const PASSWORD_CLOSE_TAG = "</Password>";
  const passwordStart = fullXmlBody.indexOf(PASSWORD_OPEN_TAG);
  let sanitizedBody = fullXmlBody;
  
  if (passwordStart !== -1) {
    const passwordEnd = fullXmlBody.indexOf(PASSWORD_CLOSE_TAG, passwordStart);
    if (passwordEnd !== -1) {
      const beforePass = fullXmlBody.substring(0, passwordStart + PASSWORD_OPEN_TAG.length);
      const afterPass = fullXmlBody.substring(passwordEnd);
      sanitizedBody = beforePass + "***" + afterPass;
    }
  }
  
  // Then take the snippet from the sanitized version
  return sanitizedBody.substring(0, snippetLength);
};

const diagnoseMygo = async () => {
  // Read credentials from environment
  const login = (Deno.env.get("MYGO_LOGIN") ?? "").trim();
  const password = (Deno.env.get("MYGO_PASSWORD") ?? "").trim();

  const loginLength = login.length;
  const passwordLength = password.length;

  // Build ListCity XML request
  const xml = buildListCityXml({ login, password });

  // Prepare request metadata for diagnostic output
  const apiUrl = "https://admin.mygo.co/api/hotel/ListCity";
  const headersForRequest = {
    "Content-Type": "application/xml; charset=utf-8",
  };
  const safeBodySnippet = createSanitizedXmlSnippet(xml, 300);

  // Make raw HTTP request to MyGo API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: headersForRequest,
      body: xml,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Get raw response text
    const text = await response.text();
    const preview = text.trim().slice(0, 300);

    // Return diagnostic information
    // Note: requestHeaders structure per problem requirements (includes accept as typical default)
    return {
      requestUrl: apiUrl,
      requestHeaders: {
        "content-type": headersForRequest["Content-Type"],
        "accept": "*/*",
      },
      requestBodyPreview: safeBodySnippet,
      loginLength,
      passwordLength,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      preview,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Build base diagnostic info that's common to all error cases
    // Note: requestHeaders structure per problem requirements (includes accept as typical default)
    const baseDiagnostics = {
      requestUrl: apiUrl,
      requestHeaders: {
        "content-type": headersForRequest["Content-Type"],
        "accept": "*/*",
      },
      requestBodyPreview: safeBodySnippet,
      loginLength,
      passwordLength,
      ok: false,
      status: 0,
      contentType: null,
    };

    // Return error information in diagnostic format
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ...baseDiagnostics,
        preview: "Request timeout after 30 seconds",
      };
    }

    return {
      ...baseDiagnostics,
      preview: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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
      case "mygo_diagnose": {
        const result = await diagnoseMygo();
        return jsonResponse(
          {
            success: true,
            action: "mygo_diagnose",
            ...result,
          },
          200,
        );
      }
      default:
        throw new ValidationError(
          `Unknown action: ${action}. Valid actions: cities, hotels, mygo_diagnose`,
        );
    }
  } catch (error) {
    console.error("Inventory sync error:", error);

    const errorResponse = formatError(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;

    return jsonResponse(errorResponse, statusCode);
  }
});
