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

DO $$
DECLARE
  null_user_count integer;
BEGIN
  SELECT COUNT(*) INTO null_user_count
  FROM public.bookings
  WHERE user_id IS NULL;

  IF null_user_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL on bookings.user_id: found % existing NULL values. Update or remove these records before applying this migration.', null_user_count;
  END IF;
END $$;

UPDATE public.bookings
SET booking_mode = 'AVEC_COMPTE'
WHERE booking_mode IS NULL;

-- booking_mode tracks the flow; customer_* fields store contact info for SANS_COMPTE bookings.
ALTER TABLE public.bookings
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.bookings
  ALTER COLUMN booking_mode SET DEFAULT 'AVEC_COMPTE',
  ALTER COLUMN booking_mode SET NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_user_id_fkey,
  ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS bookings_booking_mode_idx ON public.bookings (booking_mode);
CREATE INDEX IF NOT EXISTS bookings_customer_email_idx ON public.bookings (customer_email);
CREATE INDEX IF NOT EXISTS bookings_customer_phone_idx ON public.bookings (customer_phone);
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings (user_id);
