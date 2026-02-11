/**
 * Booking routes
 * Handles booking creation and status retrieval
 */

import { Hono } from "hono";
import { ZodError } from "zod";
import type { Env, HonoVariables } from "../types/env";
import { createBooking, bookingDetails, searchHotels } from "../clients/mygoClient";
import { createServiceClient } from "../clients/supabaseClient";
import type { MyGoCredential, MyGoSearchParams } from "../types/mygo";
import { bookingCreateSchema, uuidSchema } from "../utils/validation";
import { createLogger } from "../utils/logger";
import {
  ValidationError,
  ExternalServiceError,
  NotFoundError,
  AuthenticationError,
} from "../middleware/errorHandler";
import { optionalAuth } from "../middleware/auth";

const bookings = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Apply optional auth to all routes
bookings.use("/*", optionalAuth());

/**
 * Helper to create MyGO credential from environment
 */
const getMyGoCredential = (env: Env): MyGoCredential => ({
  login: env.MYGO_LOGIN,
  password: env.MYGO_PASSWORD,
});

/**
 * Hash token for secure logging (SHA-256)
 * Used for audit trail without exposing the actual token
 */
const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Reconstruct fresh MyGo search token server-side
 * This allows token-free booking flow where frontend doesn't handle tokens
 */
const reconstructToken = async (
  credential: MyGoCredential,
  searchParams: {
    cityId: number;
    checkIn: string;
    checkOut: string;
    rooms: Array<{ adults: number; childrenAges?: number[] }>;
    currency?: string;
  },
  selectedOffer: {
    hotelId: number;
  },
  logger: ReturnType<typeof createLogger>
): Promise<string> => {
  logger.info("Reconstructing fresh MyGo token", {
    cityId: searchParams.cityId,
    hotelId: selectedOffer.hotelId,
    checkIn: searchParams.checkIn,
    checkOut: searchParams.checkOut,
    roomCount: searchParams.rooms.length,
  });

  const mygoSearchParams: MyGoSearchParams = {
    cityId: searchParams.cityId,
    checkIn: searchParams.checkIn,
    checkOut: searchParams.checkOut,
    rooms: searchParams.rooms.map(room => ({
      adults: room.adults,
      childrenAges: room.childrenAges,
    })),
    currency: (searchParams.currency as "TND" | "EUR" | "USD" | undefined) || "TND",
    onlyAvailable: true,
    hotelIds: [selectedOffer.hotelId], // Filter to specific hotel for efficiency
  };

  try {
    const searchResult = await searchHotels(credential, mygoSearchParams);
    
    if (!searchResult.token || searchResult.token.trim().length === 0) {
      logger.error("MyGo HotelSearch returned empty token", {
        cityId: searchParams.cityId,
        hotelId: selectedOffer.hotelId,
        hotelsFound: searchResult.hotels.length,
      });
      throw new Error("Failed to retrieve booking token from MyGo");
    }

    const tokenHash = await hashToken(searchResult.token);
    logger.info("Fresh token reconstructed", {
      tokenHash: tokenHash.substring(0, 16) + "...",
      hotelsFound: searchResult.hotels.length,
    });

    return searchResult.token;
  } catch (error) {
    logger.error("Failed to reconstruct token", {
      error: error instanceof Error ? error.message : String(error),
      cityId: searchParams.cityId,
      hotelId: selectedOffer.hotelId,
    });
    
    // Re-throw ValidationError from MyGo as-is
    if (error instanceof ValidationError) {
      throw error;
    }
    
    throw new ExternalServiceError(
      "Failed to retrieve booking token from MyGo",
      "MyGo HotelSearch"
    );
  }
};

/**
 * POST /bookings/prebook
 * Create a pre-booking (non-confirmed) with myGO
 * Pre-bookings allow checking availability before final payment
 * 
 * Supports two modes:
 * 1. Token-free (recommended): Send searchParams + selectedOffer, server reconstructs token
 * 2. Legacy token-based: Send token from search results (deprecated)
 */
bookings.post("/prebook", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");
  const guestSessionId = c.get("guestSessionId");

  logger.info("Pre-booking creation request", { userId, hasGuestSession: !!guestSessionId });

  // Require either authenticated user or guest session
  if (!userId && !guestSessionId) {
    throw new AuthenticationError("Authentication or guest session required");
  }

  try {
    const body = await c.req.json();
    const validatedData = bookingCreateSchema.parse(body);

    const credential = getMyGoCredential(c.env);
    let bookingToken: string;
    let tokenHash: string;

    // Determine if this is token-free or token-based request
    const isTokenFree = validatedData.searchParams && validatedData.selectedOffer;

    if (isTokenFree) {
      // TOKEN-FREE MODE: Reconstruct fresh token server-side
      logger.info("Using token-free booking mode", {
        cityId: validatedData.searchParams!.cityId,
        hotelId: validatedData.selectedOffer!.hotelId,
      });

      bookingToken = await reconstructToken(
        credential,
        validatedData.searchParams!,
        validatedData.selectedOffer!,
        logger
      );
      tokenHash = await hashToken(bookingToken);
    } else {
      // LEGACY TOKEN-BASED MODE: Use provided token
      logger.info("Using legacy token-based booking mode");
      bookingToken = validatedData.token!;
      tokenHash = await hashToken(bookingToken);
      
      logger.info("Using provided token", {
        tokenHash: tokenHash.substring(0, 16) + "...",
      });
    }

    // Force preBooking to true for this endpoint
    const mygoParams = {
      token: bookingToken,
      preBooking: true,
      customerName: `${validatedData.customer.firstName} ${validatedData.customer.lastName}`,
      customerEmail: validatedData.customer.email,
      customerPhone: validatedData.customer.phone,
      roomSelections: validatedData.rooms.map((room) => ({
        hotelId: isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel,
        roomId: room.id,
      })),
    };

    logger.info("Creating pre-booking with myGO", {
      hotel: isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel,
      checkIn: isTokenFree ? validatedData.searchParams!.checkIn : validatedData.checkIn,
      checkOut: isTokenFree ? validatedData.searchParams!.checkOut : validatedData.checkOut,
      rooms: validatedData.rooms.length,
      tokenHash: tokenHash.substring(0, 16) + "...",
      mode: isTokenFree ? "token-free" : "token-based",
    });

    const bookingResult = await createBooking(credential, mygoParams);

    logger.info("Pre-booking created successfully", {
      bookingId: bookingResult.bookingId,
      state: bookingResult.state,
      tokenHash: tokenHash.substring(0, 16) + "...",
    });

    // Store pre-booking in database
    const supabase = createServiceClient(c.env);
    
    // Pre-bookings are always pending, regardless of myGO state
    const bookingStatus = "pending";
    
    const hotelId = isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel;
    const checkIn = isTokenFree ? validatedData.searchParams!.checkIn : validatedData.checkIn;
    const checkOut = isTokenFree ? validatedData.searchParams!.checkOut : validatedData.checkOut;
    const currency = isTokenFree 
      ? (validatedData.searchParams!.currency || "TND")
      : validatedData.currency;
    
    const bookingData = {
      user_id: userId || null,
      guest_session_id: guestSessionId || null,
      mode: userId ? "AVEC_COMPTE" : "SANS_COMPTE",
      mygo_booking_id: bookingResult.bookingId,
      mygo_state: bookingResult.state,
      hotel_id: hotelId,
      hotel_name: `Hotel ${hotelId}`, // TODO: Get actual hotel name from search results
      check_in: checkIn,
      check_out: checkOut,
      rooms: validatedData.rooms.length,
      adults: validatedData.rooms.reduce((sum, r) => sum + r.pax.adults.length, 0),
      children: validatedData.rooms.reduce((sum, r) => sum + (r.pax.children?.length || 0), 0),
      total_price: (bookingResult.totalPrice as number) || 0,
      currency: currency,
      status: bookingStatus,
      payment_status: "pending",
      customer_first_name: validatedData.customer.firstName,
      customer_last_name: validatedData.customer.lastName,
      customer_email: validatedData.customer.email,
      customer_phone: validatedData.customer.phone,
    };

    logger.info("Storing pre-booking in database", {
      mygoState: bookingResult.state,
      status: bookingStatus,
      isOnRequest: bookingResult.state === "OnRequest",
      bookingMode: isTokenFree ? "token-free" : "token-based",
    });

    const { data: dbBooking, error: dbError } = await supabase
      .from("bookings")
      .insert(bookingData)
      .select()
      .single();

    if (dbError) {
      logger.error("Failed to store pre-booking in database", { error: dbError.message });
      // Don't fail the request - myGO booking is created
    }

    return c.json({
      id: dbBooking?.id,
      mygoBookingId: bookingResult.bookingId,
      state: bookingResult.state,
      totalPrice: bookingResult.totalPrice,
      currency: currency,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid booking data", error);
    }
    // If the error is already a ValidationError from mygoClient, re-throw it
    if (error instanceof ValidationError) {
      throw error;
    }
    logger.error("Pre-booking creation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalServiceError("Failed to create pre-booking", "MyGO");
  }
});

/**
 * POST /bookings/create
 * Create a confirmed booking with myGO
 * This creates a final confirmed booking (preBooking=false)
 * 
 * Supports two modes:
 * 1. Token-free (recommended): Send searchParams + selectedOffer, server reconstructs token
 * 2. Legacy token-based: Send token from search results (deprecated)
 */
bookings.post("/create", async (c) => {
  const logger = createLogger(c.var);
  const userId = c.get("userId");
  const guestSessionId = c.get("guestSessionId");

  logger.info("Booking creation request", { userId, hasGuestSession: !!guestSessionId });

  // Require either authenticated user or guest session
  if (!userId && !guestSessionId) {
    throw new AuthenticationError("Authentication or guest session required");
  }

  try {
    const body = await c.req.json();
    const validatedData = bookingCreateSchema.parse(body);

    const credential = getMyGoCredential(c.env);
    let bookingToken: string;
    let tokenHash: string;

    // Determine if this is token-free or token-based request
    const isTokenFree = validatedData.searchParams && validatedData.selectedOffer;

    if (isTokenFree) {
      // TOKEN-FREE MODE: Reconstruct fresh token server-side
      logger.info("Using token-free booking mode", {
        cityId: validatedData.searchParams!.cityId,
        hotelId: validatedData.selectedOffer!.hotelId,
      });

      bookingToken = await reconstructToken(
        credential,
        validatedData.searchParams!,
        validatedData.selectedOffer!,
        logger
      );
      tokenHash = await hashToken(bookingToken);
    } else {
      // LEGACY TOKEN-BASED MODE: Use provided token
      logger.info("Using legacy token-based booking mode");
      bookingToken = validatedData.token!;
      tokenHash = await hashToken(bookingToken);
      
      logger.info("Using provided token", {
        tokenHash: tokenHash.substring(0, 16) + "...",
      });
    }

    // Force preBooking to false for this endpoint
    const mygoParams = {
      token: bookingToken,
      preBooking: false,
      customerName: `${validatedData.customer.firstName} ${validatedData.customer.lastName}`,
      customerEmail: validatedData.customer.email,
      customerPhone: validatedData.customer.phone,
      roomSelections: validatedData.rooms.map((room) => ({
        hotelId: isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel,
        roomId: room.id,
      })),
    };

    logger.info("Creating confirmed booking with myGO", {
      hotel: isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel,
      checkIn: isTokenFree ? validatedData.searchParams!.checkIn : validatedData.checkIn,
      checkOut: isTokenFree ? validatedData.searchParams!.checkOut : validatedData.checkOut,
      rooms: validatedData.rooms.length,
      tokenHash: tokenHash.substring(0, 16) + "...",
      mode: isTokenFree ? "token-free" : "token-based",
    });

    const bookingResult = await createBooking(credential, mygoParams);

    logger.info("Booking created successfully", {
      bookingId: bookingResult.bookingId,
      state: bookingResult.state,
      tokenHash: tokenHash.substring(0, 16) + "...",
    });

    // Store booking in database
    const supabase = createServiceClient(c.env);
    
    // For confirmed bookings (preBooking=false):
    // - Status is "confirmed" if booking is immediately confirmed by MyGO
    // - Status is "pending" if MyGO returns OnRequest state (requires manual confirmation or credit top-up)
    const bookingStatus = bookingResult.state === "OnRequest" ? "pending" : "confirmed";
    
    const hotelId = isTokenFree ? validatedData.selectedOffer!.hotelId : validatedData.hotel;
    const checkIn = isTokenFree ? validatedData.searchParams!.checkIn : validatedData.checkIn;
    const checkOut = isTokenFree ? validatedData.searchParams!.checkOut : validatedData.checkOut;
    const currency = isTokenFree 
      ? (validatedData.searchParams!.currency || "TND")
      : validatedData.currency;
    
    const bookingData = {
      user_id: userId || null,
      guest_session_id: guestSessionId || null,
      mode: userId ? "AVEC_COMPTE" : "SANS_COMPTE",
      mygo_booking_id: bookingResult.bookingId,
      mygo_state: bookingResult.state,
      hotel_id: hotelId,
      hotel_name: `Hotel ${hotelId}`, // TODO: Get actual hotel name from search results
      check_in: checkIn,
      check_out: checkOut,
      rooms: validatedData.rooms.length,
      adults: validatedData.rooms.reduce((sum, r) => sum + r.pax.adults.length, 0),
      children: validatedData.rooms.reduce((sum, r) => sum + (r.pax.children?.length || 0), 0),
      total_price: (bookingResult.totalPrice as number) || 0,
      currency: currency,
      status: bookingStatus,
      payment_status: "pending",
      customer_first_name: validatedData.customer.firstName,
      customer_last_name: validatedData.customer.lastName,
      customer_email: validatedData.customer.email,
      customer_phone: validatedData.customer.phone,
    };

    logger.info("Storing confirmed booking in database", {
      mygoState: bookingResult.state,
      status: bookingStatus,
      isOnRequest: bookingResult.state === "OnRequest",
      bookingMode: isTokenFree ? "token-free" : "token-based",
    });

    const { data: dbBooking, error: dbError } = await supabase
      .from("bookings")
      .insert(bookingData)
      .select()
      .single();

    if (dbError) {
      logger.error("Failed to store booking in database", { error: dbError.message });
      // Don't fail the request - myGO booking is created
    }

    return c.json({
      id: dbBooking?.id,
      mygoBookingId: bookingResult.bookingId,
      state: bookingResult.state,
      totalPrice: bookingResult.totalPrice,
      currency: currency,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid booking data", error);
    }
    // If the error is already a ValidationError from mygoClient, re-throw it
    if (error instanceof ValidationError) {
      throw error;
    }
    logger.error("Booking creation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ExternalServiceError("Failed to create booking", "MyGO");
  }
});

/**
 * GET /bookings/:id
 * Get booking status from database and optionally refresh from myGO
 */
bookings.get("/:id", async (c) => {
  const logger = createLogger(c.var);
  const bookingId = c.req.param("id");
  const userId = c.get("userId");
  const guestSessionId = c.get("guestSessionId");

  logger.info("Fetching booking status", { bookingId, userId });

  try {
    // Validate UUID format
    uuidSchema.parse(bookingId);

    const supabase = createServiceClient(c.env);

    // Fetch booking from database
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (error || !booking) {
      logger.warn("Booking not found", { bookingId });
      throw new NotFoundError("Booking not found");
    }

    // Verify access - user must own the booking or have guest session
    if (userId && booking.user_id !== userId) {
      logger.warn("Unauthorized booking access attempt", { bookingId, userId });
      throw new NotFoundError("Booking not found");
    }

    if (!userId && guestSessionId && booking.guest_session_id !== guestSessionId) {
      logger.warn("Unauthorized guest booking access attempt", { bookingId, guestSessionId });
      throw new NotFoundError("Booking not found");
    }

    logger.info("Booking found in database", {
      bookingId,
      status: booking.status,
      mygoBookingId: booking.mygo_booking_id,
    });

    // If booking is not in final state, try to refresh from myGO
    let mygoStatus: Record<string, unknown> | null = null;
    if (booking.mygo_booking_id && ["pending", "confirmed"].includes(booking.status)) {
      try {
        const credential = getMyGoCredential(c.env);
        mygoStatus = await bookingDetails(credential, { booking: booking.mygo_booking_id });

        const bookingState = (mygoStatus as any)?.booking?.State;
        logger.info("Fetched latest status from myGO", {
          mygoBookingId: booking.mygo_booking_id,
          state: bookingState,
        });

        // Update database with latest myGO state if changed
        if (bookingState && bookingState !== booking.mygo_state) {
          await supabase
            .from("bookings")
            .update({ mygo_state: bookingState })
            .eq("id", bookingId);
        }
      } catch (mygoError) {
        logger.warn("Failed to fetch booking from myGO", {
          error: mygoError instanceof Error ? mygoError.message : String(mygoError),
        });
        // Continue with database data
      }
    }

    return c.json({
      id: booking.id,
      mygoBookingId: booking.mygo_booking_id,
      mygoState: booking.mygo_state,
      hotelId: booking.hotel_id,
      hotelName: booking.hotel_name,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      rooms: booking.rooms,
      adults: booking.adults,
      children: booking.children,
      totalPrice: booking.total_price,
      currency: booking.currency,
      status: booking.status,
      paymentStatus: booking.payment_status,
      customer: {
        firstName: booking.customer_first_name,
        lastName: booking.customer_last_name,
        email: booking.customer_email,
        phone: booking.customer_phone,
      },
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      mygoDetails: mygoStatus,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid booking ID format", error);
    }
    logger.error("Failed to fetch booking", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export default bookings;
