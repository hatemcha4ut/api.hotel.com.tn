import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  listCities,
  type MyGoCity,
  type MyGoCredential,
} from "../_shared/lib/mygoClient.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { formatError, ValidationError } from "../_shared/errors.ts";

const getMyGoCredential = (): MyGoCredential => {
  const login = Deno.env.get("MYGO_LOGIN");
  const password = Deno.env.get("MYGO_PASSWORD");

  if (!login || !password) {
    throw new Error("MYGO_LOGIN and MYGO_PASSWORD must be configured");
  }

  return { login, password };
};

const syncCities = async (supabase: ReturnType<typeof createClient>) => {
  const credential = getMyGoCredential();

  // Fetch cities from MyGo
  const cities = await listCities(credential);

  if (!cities || cities.length === 0) {
    return { processed: 0 };
  }

  // Upsert cities into database
  const citiesData = cities.map((city: MyGoCity) => ({
    id: city.id,
    name: city.name,
    region: city.region ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("mygo_cities")
    .upsert(citiesData, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to sync cities: ${error.message}`);
  }

  return {
    processed: cities.length,
  };
};

serve(async (request) => {
  // Only POST allowed
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Require admin authentication
    await requireAdmin(request);

    // Parse request body
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
    const action = typeof body.action === "string" ? body.action.toLowerCase() : "";

    if (!action) {
      throw new ValidationError("Missing action parameter");
    }

    // Get Supabase configuration
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    // Create Supabase client with service role
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
        // TODO: Implement hotel sync (requires iterating through cities)
        return jsonResponse(
          { error: "Hotels sync not yet implemented" },
          501,
        );
      }

      default:
        throw new ValidationError(
          `Unknown action: ${action}. Valid actions: cities, hotels`,
        );
    }
  } catch (error) {
    console.error("Sync error:", error);

    const errorResponse = formatError(error);
    const statusCode = error instanceof ValidationError ? 400 : 500;

    return jsonResponse(errorResponse, statusCode);
  }
});
