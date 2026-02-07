-- Create profiles table for authenticated users
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add guest_whatsapp_number column to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_whatsapp_number text;

CREATE INDEX IF NOT EXISTS bookings_guest_whatsapp_number_idx
  ON public.bookings (guest_whatsapp_number);

COMMENT ON TABLE public.profiles IS 'User profiles with optional WhatsApp number for authenticated users';
COMMENT ON COLUMN public.bookings.guest_whatsapp_number IS 'WhatsApp number for guest (SANS_COMPTE) bookings, stored in E.164 format';
