-- Add booking_mode enum and new booking fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_mode') THEN
    CREATE TYPE public.booking_mode AS ENUM ('SANS_COMPTE', 'AVEC_COMPTE');
  END IF;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_mode public.booking_mode,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_first_name text,
  ADD COLUMN IF NOT EXISTS customer_last_name text;

ALTER TABLE public.bookings
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN booking_mode SET DEFAULT 'SANS_COMPTE';

UPDATE public.bookings
SET booking_mode = 'SANS_COMPTE'
WHERE booking_mode IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN booking_mode SET NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_user_id_fkey,
  ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS bookings_booking_mode_idx ON public.bookings (booking_mode);
CREATE INDEX IF NOT EXISTS bookings_customer_email_idx ON public.bookings (customer_email);
CREATE INDEX IF NOT EXISTS bookings_customer_phone_idx ON public.bookings (customer_phone);
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings (user_id);
