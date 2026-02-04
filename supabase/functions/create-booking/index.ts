import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  searchHotels,
  createBooking,
  type MyGoCredential,
  type MyGoBookingParams,
  type MyGoSearchParams,
} from "../_shared/lib/mygoClient.ts";
import { getCorsHeaders, handleOptions, jsonResponse, isOriginAllowed } from "../_shared/cors.ts";
import { requireUserJWT, createAuthenticatedClient } from "../_shared/auth.ts";
import { validateSearchParams, requireString, isValidEmail, isValidPhone } from "../_shared/validation.ts";
import { formatError, ValidationError, ExternalServiceError } from "../_shared/errors.ts";

// Hash token for secure storage (never store plain token)
const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Get MyGo credentials from environment
 */
const getMyGoCredential = (): MyGoCredential => {
  const login = Deno.env.get("MYGO_LOGIN");
  const password = Deno.env.get("MYGO_PASSWORD");

  if (!login || !password) {
    throw new Error("MYGO_LOGIN and MYGO_PASSWORD must be configured");
  }

  return { login, password };
};

serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";

  // Check origin
  if (origin && !isOriginAllowed(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403);
  }

  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return handleOptions(origin);
  }

  // Only POST allowed
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    // Require JWT authentication
    const user = await requireUserJWT(request);

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

    // NEW INPUT STRUCTURE: { searchParams, selectedOffer, guestData, preBooking }
    
    // Validate searchParams
    if (!body.searchParams) {
      throw new ValidationError("searchParams is required");
    }
    const searchParams = validateSearchParams(body.searchParams);

    // Validate selectedOffer
    if (!body.selectedOffer || typeof body.selectedOffer !== "object") {
      throw new ValidationError("selectedOffer is required (object)");
    }
    const selectedOffer = body.selectedOffer as Record<string, unknown>;

    if (typeof selectedOffer.hotelId !== "number") {
      throw new ValidationError("selectedOffer.hotelId is required (number)");
    }
    if (typeof selectedOffer.roomId !== "number") {
      throw new ValidationError("selectedOffer.roomId is required (number)");
    }

    // Validate guestData
    if (!body.guestData || typeof body.guestData !== "object") {
      throw new ValidationError("guestData is required (object)");
    }
    const guestData = body.guestData as Record<string, unknown>;

    const customerName = requireString(guestData.name, "guestData.name");
    const customerEmail = requireString(guestData.email, "guestData.email");
    const customerPhone = requireString(guestData.phone, "guestData.phone");

    // Validate email and phone format
    if (!isValidEmail(customerEmail)) {
      throw new ValidationError("guestData.email must be a valid email address");
    }
    if (!isValidPhone(customerPhone)) {
      throw new ValidationError("guestData.phone must be a valid phone number");
    }

    // Default to preBooking=true (recommended)
    const preBooking = typeof body.preBooking === "boolean" ? body.preBooking : true;

    // STEP 1: Server-side call to MyGo HotelSearch to get fresh token
    const credential = getMyGoCredential();
    
    const mygoSearchParams: MyGoSearchParams = {
      cityId: searchParams.cityId,
      checkIn: searchParams.checkIn,
      checkOut: searchParams.checkOut,
      rooms: searchParams.rooms,
      currency: searchParams.currency,
      onlyAvailable: true,
    };

    let freshToken: string;
    try {
      const searchResult = await searchHotels(credential, mygoSearchParams);
      freshToken = searchResult.token;
      // Token stays in memory only, never sent to client or stored
    } catch (error) {
      console.error("Failed to get fresh search token:", error);
      throw new ExternalServiceError(
        "Failed to retrieve booking token from MyGo",
        "MyGo HotelSearch"
      );
    }

    // STEP 2: Call BookingCreation with fresh token
    const bookingParams: MyGoBookingParams = {
      token: freshToken,
      preBooking,
      customerName,
      customerEmail,
      customerPhone,
      roomSelections: [{
        hotelId: selectedOffer.hotelId as number,
        roomId: selectedOffer.roomId as number,
      }],
    };

    let myGoResponse;
    try {
      myGoResponse = await createBooking(credential, bookingParams);
    } catch (error) {
      console.error("MyGo booking creation failed:", error);
      throw new ExternalServiceError(
        error instanceof Error ? error.message : "Booking creation failed",
        "MyGo BookingCreation"
      );
    }

    // STEP 3: Store booking record in database
    const supabase = createAuthenticatedClient(request);
    const tokenHash = await hashToken(freshToken);

    const { data: bookingRecord, error: dbError } = await supabase
      .from("mygo_bookings")
      .insert({
        prebooking: preBooking,
        token_hash: tokenHash,
        booking_id: myGoResponse.bookingId ?? null,
        state: myGoResponse.state ?? null,
        total_price: myGoResponse.totalPrice ?? null,
        request_json: {
          customerName,
          customerEmail,
          customerPhone,
          roomSelections: bookingParams.roomSelections,
          searchParams: mygoSearchParams,
          preBooking,
        },
        response_json: myGoResponse,
      })
      .select()
      .single();

    // STEP 4: Handle DB tracking failure gracefully
    if (dbError) {
      console.error("CRITICAL: Booking created in MyGo but DB tracking failed:", {
        message: dbError.message,
        code: dbError.code,
        myGoBookingId: myGoResponse.bookingId,
        userId: user.userId,
      });

      // Return 200 to avoid retry and double booking
      return jsonResponse(
        {
          bookingCreated: true,
          trackingSaved: false,
          bookingId: myGoResponse.bookingId,
          warning: "Booking was created but tracking record failed. Contact support with this booking ID.",
          ...myGoResponse,
        },
        200,
        origin,
      );
    }

    // Success - both booking and tracking saved
    return jsonResponse(
      {
        bookingCreated: true,
        trackingSaved: true,
        ...myGoResponse,
        recordId: bookingRecord.id,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Booking error:", error);

    const errorResponse = formatError(error);
    const statusCode = error instanceof ValidationError ? 400
      : error instanceof ExternalServiceError ? 502
      : 500;

    return jsonResponse(errorResponse, statusCode, origin);
  }
});
