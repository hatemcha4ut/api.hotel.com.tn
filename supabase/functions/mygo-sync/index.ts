import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  listCities,
  type MyGoCity,
  type MyGoCredential,
} from "../_shared/lib/mygoClient.ts";

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
    return { inserted: 0, updated: 0 };
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
    inserted: cities.length,
    updated: cities.length,
  };
};

serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Check for JWT auth
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");

  if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
    return jsonResponse(
      { error: "Supabase configuration missing" },
      500,
    );
  }

  // Verify JWT
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const { verify } = await import("https://deno.land/x/djwt@v2.8/mod.ts");
    const payload = await verify(token, jwtSecret, "HS256") as Record<string, unknown>;

    // Check if user is admin or service role
    const role = payload.role as string | undefined;
    if (role !== "service_role" && role !== "authenticated") {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    // For authenticated users, check admin_users table
    if (role === "authenticated") {
      const userId = payload.sub as string | undefined;
      if (!userId) {
        return jsonResponse({ error: "Invalid token" }, 401);
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!adminUser) {
        return jsonResponse({ error: "Admin access required" }, 403);
      }
    }
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid token" },
      401,
    );
  }

  // Parse request body
  let payload: { action?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const action = payload.action?.toLowerCase();

  if (!action) {
    return jsonResponse({ error: "Missing action parameter" }, 400);
  }

  // Create Supabase client with service role
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
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
        return jsonResponse(
          { error: `Unknown action: ${action}. Valid actions: cities, hotels` },
          400,
        );
    }
  } catch (error) {
    console.error("Sync error:", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Sync failed",
      },
      500,
    );
  }
});
