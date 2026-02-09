/**
 * Static data routes
 * Handles cached static data from myGO (cities, countries, categories, etc.)
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import {
  listCities,
  listCountries,
  listCategories,
  listBoardings,
  listTags,
  listLanguages,
  listCurrencies,
} from "../clients/mygoClient";
import type { MyGoCredential } from "../types/mygo";
import { createLogger } from "../utils/logger";
import { ExternalServiceError } from "../middleware/errorHandler";
import { getCachedCities, setCachedCities } from "../cache/citiesCache";
import { DEFAULT_TUNISIAN_CITIES } from "../data/defaultCities";

const static_routes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Cache control header (1 hour)
const CACHE_HEADER = "public, max-age=3600";

/**
 * Helper to create MyGO credential from environment
 */
const getMyGoCredential = (env: Env): MyGoCredential => ({
  login: env.MYGO_LOGIN,
  password: env.MYGO_PASSWORD,
});

/**
 * Helper to build ETag from cities list
 */
const buildCitiesETag = (cities: Array<{ id: number; name: string; region: string | null }>): string => {
  const firstId = cities.length > 0 ? cities[0].id : 0;
  const lastId = cities.length > 0 ? cities[cities.length - 1].id : 0;
  return `"cities-${cities.length}-${firstId}-${lastId}"`;
};

/**
 * GET /static/cities
 * Get list of cities from myGO — public, cached, GET-friendly endpoint
 * Response: { items: [...], source: "mygo"|"default", cached: boolean, fetchedAt: string }
 * 
 * Strategy:
 * 1. Check in-memory cache → if fresh, return immediately
 * 2. Try fetching from myGO API
 * 3. On failure, check for stale cache → if exists, return it
 * 4. Ultimate fallback → return DEFAULT_TUNISIAN_CITIES
 */
static_routes.get("/cities", async (c) => {
  const logger = createLogger(c.var);
  const startTime = Date.now();
  logger.info("Fetching cities list (GET)");

  // Step 1: Check fresh cache
  const cachedData = getCachedCities();
  if (cachedData && !cachedData.stale) {
    const durationMs = Date.now() - startTime;
    logger.info("Serving cities from fresh cache", {
      count: cachedData.cities.length,
      durationMs,
    });

    const etag = buildCitiesETag(cachedData.cities);

    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    return c.json(
      {
        items: cachedData.cities,
        source: "mygo",
        cached: true,
        fetchedAt: cachedData.fetchedAt,
      },
      200,
      {
        "Cache-Control": CACHE_HEADER,
        "ETag": etag,
      }
    );
  }

  // Step 2: Try fetching from myGO
  try {
    const credential = getMyGoCredential(c.env);
    const cities = await listCities(credential);
    const durationMs = Date.now() - startTime;

    logger.info("Cities fetched from myGO", { count: cities.length, durationMs });

    // Normalize cities to ensure region is string | null
    const normalizedCities = cities.map((city) => ({
      id: city.id,
      name: city.name,
      region: city.region ?? null,
    }));

    // Update cache
    setCachedCities(normalizedCities);

    const etag = buildCitiesETag(normalizedCities);

    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    return c.json(
      {
        items: normalizedCities,
        source: "mygo",
        cached: false,
        fetchedAt: new Date().toISOString(),
      },
      200,
      {
        "Cache-Control": CACHE_HEADER,
        "ETag": etag,
      }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.warn("Failed to fetch cities from myGO", {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    // Step 3: Fall back to stale cache if available
    if (cachedData && cachedData.stale) {
      logger.warn("Serving stale cached cities as fallback", {
        count: cachedData.cities.length,
        age: Date.now() - new Date(cachedData.fetchedAt).getTime(),
      });

      const etag = buildCitiesETag(cachedData.cities);

      const ifNoneMatch = c.req.header("If-None-Match");
      if (ifNoneMatch === etag) {
        return c.body(null, 304);
      }

      return c.json(
        {
          items: cachedData.cities,
          source: "mygo",
          cached: true,
          fetchedAt: cachedData.fetchedAt,
        },
        200,
        {
          "Cache-Control": CACHE_HEADER,
          "ETag": etag,
        }
      );
    }

    // Step 4: Ultimate fallback - return default cities
    logger.warn("No cache available, serving default Tunisian cities", {
      count: DEFAULT_TUNISIAN_CITIES.length,
    });

    const etag = buildCitiesETag(DEFAULT_TUNISIAN_CITIES);

    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304);
    }

    return c.json(
      {
        items: DEFAULT_TUNISIAN_CITIES,
        source: "default",
        cached: false,
        fetchedAt: new Date().toISOString(),
      },
      200,
      {
        "Cache-Control": CACHE_HEADER,
        "ETag": etag,
      }
    );
  }
});

/**
 * POST /static/list-city
 * Get list of cities from myGO with caching
 * Response: { cities: [...] }
 * 
 * Strategy (same as GET):
 * 1. Check in-memory cache → if fresh, return immediately
 * 2. Try fetching from myGO API
 * 3. On failure, check for stale cache → if exists, return it
 * 4. Ultimate fallback → return DEFAULT_TUNISIAN_CITIES
 */
static_routes.post("/list-city", async (c) => {
  const logger = createLogger(c.var);
  const startTime = Date.now();
  logger.info("Fetching cities list (POST)");

  // Step 1: Check fresh cache
  const cachedData = getCachedCities();
  if (cachedData && !cachedData.stale) {
    const durationMs = Date.now() - startTime;
    logger.info("Serving cities from fresh cache (POST)", {
      count: cachedData.cities.length,
      durationMs,
    });

    return c.json(
      { cities: cachedData.cities },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  }

  // Step 2: Try fetching from myGO
  try {
    const credential = getMyGoCredential(c.env);
    const cities = await listCities(credential);
    const durationMs = Date.now() - startTime;

    logger.info("Cities list fetched successfully from myGO (POST)", {
      count: cities.length,
      durationMs,
    });

    // Normalize cities to ensure region is string | null
    const normalizedCities = cities.map((city) => ({
      id: city.id,
      name: city.name,
      region: city.region ?? null,
    }));

    // Update cache
    setCachedCities(normalizedCities);

    return c.json(
      { cities: normalizedCities },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.warn("Failed to fetch cities from myGO (POST)", {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    // Step 3: Fall back to stale cache if available
    if (cachedData && cachedData.stale) {
      logger.warn("Serving stale cached cities as fallback (POST)", {
        count: cachedData.cities.length,
        age: Date.now() - new Date(cachedData.fetchedAt).getTime(),
      });

      return c.json(
        { cities: cachedData.cities },
        200,
        { "Cache-Control": CACHE_HEADER }
      );
    }

    // Step 4: Ultimate fallback - return default cities
    logger.warn("No cache available, serving default Tunisian cities (POST)", {
      count: DEFAULT_TUNISIAN_CITIES.length,
    });

    return c.json(
      { cities: DEFAULT_TUNISIAN_CITIES },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  }
});

/**
 * POST /static/list-country
 * Get list of countries from myGO with caching
 */
static_routes.post("/list-country", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching countries list");

  try {
    const credential = getMyGoCredential(c.env);
    const countries = await listCountries(credential);

    logger.info("Countries list fetched successfully", { count: countries.length });

    return c.json(
      { countries },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch countries", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch countries from myGO", "MyGO");
  }
});

/**
 * POST /static/list-category
 * Get list of hotel categories from myGO with caching
 */
static_routes.post("/list-category", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching categories list");

  try {
    const credential = getMyGoCredential(c.env);
    const categories = await listCategories(credential);

    logger.info("Categories list fetched successfully", { count: categories.length });

    return c.json(
      { categories },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch categories", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch categories from myGO", "MyGO");
  }
});

/**
 * POST /static/list-boarding
 * Get list of boarding options from myGO with caching
 */
static_routes.post("/list-boarding", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching boardings list");

  try {
    const credential = getMyGoCredential(c.env);
    const boardings = await listBoardings(credential);

    logger.info("Boardings list fetched successfully", { count: boardings.length });

    return c.json(
      { boardings },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch boardings", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch boardings from myGO", "MyGO");
  }
});

/**
 * POST /static/list-tag
 * Get list of hotel tags from myGO with caching
 */
static_routes.post("/list-tag", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching tags list");

  try {
    const credential = getMyGoCredential(c.env);
    const tags = await listTags(credential);

    logger.info("Tags list fetched successfully", { count: tags.length });

    return c.json(
      { tags },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch tags", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch tags from myGO", "MyGO");
  }
});

/**
 * POST /static/list-language
 * Get list of supported languages from myGO with caching
 */
static_routes.post("/list-language", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching languages list");

  try {
    const credential = getMyGoCredential(c.env);
    const languages = await listLanguages(credential);

    logger.info("Languages list fetched successfully", { count: languages.length });

    return c.json(
      { languages },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch languages", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch languages from myGO", "MyGO");
  }
});

/**
 * POST /static/list-currency
 * Get list of supported currencies from myGO with caching
 */
static_routes.post("/list-currency", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Fetching currencies list");

  try {
    const credential = getMyGoCredential(c.env);
    const currencies = await listCurrencies(credential);

    logger.info("Currencies list fetched successfully", { count: currencies.length });

    return c.json(
      { currencies },
      200,
      { "Cache-Control": CACHE_HEADER }
    );
  } catch (error) {
    logger.error("Failed to fetch currencies", { error: error instanceof Error ? error.message : String(error) });
    throw new ExternalServiceError("Failed to fetch currencies from myGO", "MyGO");
  }
});

export default static_routes;
