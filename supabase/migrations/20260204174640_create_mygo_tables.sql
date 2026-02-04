-- Create MyGo integration tables for custom XML API integration
-- MyGo uses HTTP POST with XML (NOT SOAP) to https://admin.mygo.co/api/hotel/{ServiceName}

-- Static data tables for MyGo cities and hotels
CREATE TABLE IF NOT EXISTS public.mygo_cities (
  id integer PRIMARY KEY,
  name text NOT NULL,
  region text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mygo_cities_name_idx ON public.mygo_cities (name);
CREATE INDEX IF NOT EXISTS mygo_cities_updated_at_idx ON public.mygo_cities (updated_at);

CREATE TABLE IF NOT EXISTS public.mygo_hotels (
  id integer PRIMARY KEY,
  name text NOT NULL,
  city_id integer REFERENCES public.mygo_cities(id) ON DELETE CASCADE,
  star text,
  category_title text,
  address text,
  longitude text,
  latitude text,
  image text,
  note text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mygo_hotels_city_id_idx ON public.mygo_hotels (city_id);
CREATE INDEX IF NOT EXISTS mygo_hotels_name_idx ON public.mygo_hotels (name);
CREATE INDEX IF NOT EXISTS mygo_hotels_updated_at_idx ON public.mygo_hotels (updated_at);

-- Rate limiting table for public search-hotels endpoint
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON public.rate_limits (window_start);

-- Cache table for search results with short TTL
CREATE TABLE IF NOT EXISTS public.search_cache (
  key text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  response_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS search_cache_expires_at_idx ON public.search_cache (expires_at);

-- Bookings table for MyGo BookingCreation tracking
CREATE TABLE IF NOT EXISTS public.mygo_bookings (
  id bigserial PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  prebooking boolean NOT NULL DEFAULT true,
  token_hash text NOT NULL,
  booking_id integer,
  state text,
  total_price numeric,
  request_json jsonb NOT NULL,
  response_json jsonb
);

CREATE INDEX IF NOT EXISTS mygo_bookings_token_hash_idx ON public.mygo_bookings (token_hash);
CREATE INDEX IF NOT EXISTS mygo_bookings_booking_id_idx ON public.mygo_bookings (booking_id);
CREATE INDEX IF NOT EXISTS mygo_bookings_created_at_idx ON public.mygo_bookings (created_at);
CREATE INDEX IF NOT EXISTS mygo_bookings_state_idx ON public.mygo_bookings (state);

-- RLS policies for MyGo tables
ALTER TABLE public.mygo_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygo_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mygo_bookings ENABLE ROW LEVEL SECURITY;

-- mygo_cities: SELECT for anon + authenticated (public read access)
CREATE POLICY "mygo_cities_select_anon"
  ON public.mygo_cities
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "mygo_cities_select_authenticated"
  ON public.mygo_cities
  FOR SELECT
  TO authenticated
  USING (true);

-- mygo_hotels: SELECT for anon + authenticated (public read access)
CREATE POLICY "mygo_hotels_select_anon"
  ON public.mygo_hotels
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "mygo_hotels_select_authenticated"
  ON public.mygo_hotels
  FOR SELECT
  TO authenticated
  USING (true);

-- rate_limits: No direct access (managed by edge functions only)
-- search_cache: No direct access (managed by edge functions only)

-- mygo_bookings: Users can only see their own bookings
-- Note: mygo_bookings tracks MyGo API calls, not user bookings
-- For MVP, authenticated users can query their related bookings via token_hash
-- In production, consider adding user_id foreign key for better isolation
CREATE POLICY "mygo_bookings_select_own"
  ON public.mygo_bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
    )
  );

-- Admin users can see all bookings
CREATE POLICY "mygo_bookings_select_admin"
  ON public.mygo_bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.mygo_cities IS 'Static data from MyGo ListCity API - synced via mygo-sync function';
COMMENT ON TABLE public.mygo_hotels IS 'Static data from MyGo ListHotel API - synced via mygo-sync function';
COMMENT ON TABLE public.rate_limits IS 'Rate limiting for public search-hotels endpoint - key format: hash(ip):window';
COMMENT ON TABLE public.search_cache IS 'Short-lived cache (120s TTL) for search-hotels responses';
COMMENT ON TABLE public.mygo_bookings IS 'MyGo BookingCreation records - token_hash stored (never plain token), prebooking flag tracks PreBooking=true calls';
