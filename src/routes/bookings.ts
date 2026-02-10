/**
 * Booking routes
 * Handles booking creation and status retrieval
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { createBooking, bookingDetails } from "../clients/mygoClient";
import { createServiceClient } from "../clients/supabaseClient";
import type { MyGoCredential } from "../types/mygo";
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
 * POST /bookings/prebook
 * Create a pre-booking (non-confirmed) with myGO
 * Pre-bookings allow checking availability before final payment
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

    // Force preBooking to true for this endpoint
    const mygoParams = {
      token: validatedData.token,
      preBooking: true,
      customerName: `${validatedData.customer.firstName} ${validatedData.customer.lastName}`,
      customerEmail: validatedData.customer.email,
      customerPhone: validatedData.customer.phone,
      roomSelections: validatedData.rooms.map((room) => ({
        hotelId: validatedData.hotel,
        roomId: room.id,
      })),
    };

    const credential = getMyGoCredential(c.env);

    logger.info("Creating pre-booking with myGO", {
      hotel: validatedData.hotel,
      checkIn: validatedData.checkIn,
      checkOut: validatedData.checkOut,
      rooms: validatedData.rooms.length,
    });

    const bookingResult = await createBooking(credential, mygoParams);

    logger.info("Pre-booking created successfully", {
      bookingId: bookingResult.bookingId,
      state: bookingResult.state,
    });

    // Store pre-booking in database
    const supabase = createServiceClient(c.env);
    
    // Determine booking status based on myGO state
    // OnRequest bookings should be pending until confirmed or credit is topped up
    const bookingStatus = bookingResult.state === "OnRequest" ? "pending" : "pending";
    
    const bookingData = {
      user_id: userId || null,
      guest_session_id: guestSessionId || null,
      mode: userId ? "AVEC_COMPTE" : "SANS_COMPTE",
      mygo_booking_id: bookingResult.bookingId,
      mygo_state: bookingResult.state,
      hotel_id: validatedData.hotel,
      hotel_name: `Hotel ${validatedData.hotel}`, // TODO: Get actual hotel name from search results
      check_in: validatedData.checkIn,
      check_out: validatedData.checkOut,
      rooms: validatedData.rooms.length,
      adults: validatedData.rooms.reduce((sum, r) => sum + r.pax.adults.length, 0),
      children: validatedData.rooms.reduce((sum, r) => sum + (r.pax.children?.length || 0), 0),
      total_price: (bookingResult.totalPrice as number) || 0,
      currency: validatedData.currency,
      status: bookingStatus,
      payment_status: "pending",
      customer_first_name: validatedData.customer.firstName,
      customer_last_name: validatedData.customer.lastName,
      customer_email: validatedData.customer.email,
      customer_phone: validatedData.customer.phone,
    };

    logger.info("Storing booking in database", {
      mygoState: bookingResult.state,
      status: bookingStatus,
      isOnRequest: bookingResult.state === "OnRequest",
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
      currency: validatedData.currency,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid booking data", error);
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

    // Force preBooking to false for this endpoint
    const mygoParams = {
      token: validatedData.token,
      preBooking: false,
      customerName: `${validatedData.customer.firstName} ${validatedData.customer.lastName}`,
      customerEmail: validatedData.customer.email,
      customerPhone: validatedData.customer.phone,
      roomSelections: validatedData.rooms.map((room) => ({
        hotelId: validatedData.hotel,
        roomId: room.id,
      })),
    };

    const credential = getMyGoCredential(c.env);

    logger.info("Creating confirmed booking with myGO", {
      hotel: validatedData.hotel,
      checkIn: validatedData.checkIn,
      checkOut: validatedData.checkOut,
      rooms: validatedData.rooms.length,
    });

    const bookingResult = await createBooking(credential, mygoParams);

    logger.info("Booking created successfully", {
      bookingId: bookingResult.bookingId,
      state: bookingResult.state,
    });

    // Store booking in database
    const supabase = createServiceClient(c.env);
    
    // Determine booking status based on myGO state
    // OnRequest bookings should be pending until confirmed or credit is topped up
    // For confirmed bookings (preBooking=false), status is "confirmed" unless OnRequest
    const bookingStatus = bookingResult.state === "OnRequest" ? "pending" : "confirmed";
    
    const bookingData = {
      user_id: userId || null,
      guest_session_id: guestSessionId || null,
      mode: userId ? "AVEC_COMPTE" : "SANS_COMPTE",
      mygo_booking_id: bookingResult.bookingId,
      mygo_state: bookingResult.state,
      hotel_id: validatedData.hotel,
      hotel_name: `Hotel ${validatedData.hotel}`, // TODO: Get actual hotel name from search results
      check_in: validatedData.checkIn,
      check_out: validatedData.checkOut,
      rooms: validatedData.rooms.length,
      adults: validatedData.rooms.reduce((sum, r) => sum + r.pax.adults.length, 0),
      children: validatedData.rooms.reduce((sum, r) => sum + (r.pax.children?.length || 0), 0),
      total_price: (bookingResult.totalPrice as number) || 0,
      currency: validatedData.currency,
      status: bookingStatus,
      payment_status: "pending",
      customer_first_name: validatedData.customer.firstName,
      customer_last_name: validatedData.customer.lastName,
      customer_email: validatedData.customer.email,
      customer_phone: validatedData.customer.phone,
    };

    logger.info("Storing booking in database", {
      mygoState: bookingResult.state,
      status: bookingStatus,
      isOnRequest: bookingResult.state === "OnRequest",
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
      currency: validatedData.currency,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid booking data", error);
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
    if (error instanceof Error && error.name === "ZodError") {
      throw new ValidationError("Invalid booking ID format", error);
    }
    logger.error("Failed to fetch booking", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export default bookings;
