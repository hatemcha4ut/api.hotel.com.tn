-- Add MyGo token hash and booking reference fields to bookings table
-- These fields support the hotfix that removes tokens from the public search API
-- and generates fresh tokens server-side during booking creation

-- Add mygo_token_hash: stores SHA-256 hash of the MyGo token (never the plain token)
-- This allows us to reference the booking with MyGo later if needed
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mygo_token_hash text;

-- Add mygo_booking_reference: stores the booking reference returned by MyGo
-- This is the confirmation identifier from MyGo's BookingCreation call
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mygo_booking_reference text;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS bookings_mygo_token_hash_idx 
  ON public.bookings (mygo_token_hash);

CREATE INDEX IF NOT EXISTS bookings_mygo_booking_reference_idx 
  ON public.bookings (mygo_booking_reference);

-- Add comments to document these fields
COMMENT ON COLUMN public.bookings.mygo_token_hash IS 
  'SHA-256 hash of MyGo token used for booking. Plain token is never stored for security.';

COMMENT ON COLUMN public.bookings.mygo_booking_reference IS 
  'Booking reference returned by MyGo BookingCreation API with PreBooking=true.';
