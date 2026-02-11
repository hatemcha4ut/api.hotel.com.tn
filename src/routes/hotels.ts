/**
 * Hotel routes
 * Handles hotel search and detail operations
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { searchHotels, hotelDetail } from "../clients/mygoClient";
import type { MyGoCredential } from "../types/mygo";
import { hotelSearchSchema, hotelDetailSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { ValidationError, ExternalServiceError } from "../middleware/errorHandler";

const hotels = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * Helper to create MyGO credential from environment
 */
const getMyGoCredential = (env: Env): MyGoCredential => ({
  login: env.MYGO_LOGIN,
  password: env.MYGO_PASSWORD,
});

/**
 * POST /hotels/search
 * Search for available hotels with room rates
 * Strips token from response for security
 */
hotels.post("/search", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Hotel search request");

  try {
    const body = await c.req.json();
    const validatedData = hotelSearchSchema.parse(body);

    const credential = getMyGoCredential(c.env);

    // Build search parameters for myGO
    const searchParams = {
      cityId: validatedData.cityId,
      checkIn: validatedData.checkIn,
      checkOut: validatedData.checkOut,
      rooms: validatedData.rooms.map((room) => ({
        adults: room.adults,
        childrenAges: room.childrenAges || [],
      })),
      hotelIds: validatedData.hotelIds,
      currency: validatedData.currency,
      onlyAvailable: validatedData.onlyAvailable,
      keywords: validatedData.keywords,
      categories: validatedData.categories,
      tags: validatedData.tags,
    };

    logger.info("Searching hotels", {
      cityId: validatedData.cityId,
      checkIn: validatedData.checkIn,
      checkOut: validatedData.checkOut,
      rooms: validatedData.rooms.length,
    });

    const searchResult = await searchHotels(credential, searchParams);

    logger.info("Hotel search completed", {
      hotelsFound: searchResult.hotels.length,
      hasToken: !!searchResult.token,
    });

    // Strip token from response for security - client shouldn't see it
    const { token, ...safeResponse } = searchResult;

    // Log token separately for debugging (will be masked by logger)
    logger.debug("Search token generated", { token });

    return c.json(safeResponse);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid hotel search data", error);
    }
    // If the error is already a ValidationError from mygoClient, re-throw it
    if (error instanceof ValidationError) {
      throw error;
    }
    logger.error("Hotel search failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalServiceError("Failed to search hotels", "MyGO");
  }
});

/**
 * POST /hotels/detail
 * Get detailed information about a specific hotel
 */
hotels.post("/detail", async (c) => {
  const logger = createLogger(c.var);
  logger.info("Hotel detail request");

  try {
    const body = await c.req.json();
    const validatedData = hotelDetailSchema.parse(body);

    const credential = getMyGoCredential(c.env);

    logger.info("Fetching hotel detail", { hotelId: validatedData.hotelId });

    const hotelDetailParams: Record<string, unknown> = {
      hotel: validatedData.hotelId,
    };

    if (validatedData.currency) {
      hotelDetailParams.currency = validatedData.currency;
    }

    const hotelDetailResult = await hotelDetail(credential, hotelDetailParams);

    logger.info("Hotel detail fetched successfully", {
      hotelId: validatedData.hotelId,
    });

    return c.json(hotelDetailResult);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid hotel detail request", error);
    }
    logger.error("Hotel detail fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalServiceError("Failed to fetch hotel details", "MyGO");
  }
});

export default hotels;
