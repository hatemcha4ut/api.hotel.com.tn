-- Create generic inventory tables for supplier-synced cities and hotels
CREATE TABLE IF NOT EXISTS public.inventory_cities (
  id integer PRIMARY KEY,
  name text NOT NULL,
  region text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_cities_name_idx ON public.inventory_cities (name);
CREATE INDEX IF NOT EXISTS inventory_cities_updated_at_idx ON public.inventory_cities (updated_at);

CREATE TABLE IF NOT EXISTS public.inventory_hotels (
  id integer PRIMARY KEY,
  name text NOT NULL,
  city_id integer REFERENCES public.inventory_cities(id) ON DELETE CASCADE,
  star text,
  category_title text,
  address text,
  longitude text,
  latitude text,
  image text,
  note text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_hotels_city_id_idx ON public.inventory_hotels (city_id);
CREATE INDEX IF NOT EXISTS inventory_hotels_name_idx ON public.inventory_hotels (name);
CREATE INDEX IF NOT EXISTS inventory_hotels_updated_at_idx ON public.inventory_hotels (updated_at);

ALTER TABLE public.inventory_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_cities_select_anon"
  ON public.inventory_cities
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "inventory_cities_select_authenticated"
  ON public.inventory_cities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "inventory_hotels_select_anon"
  ON public.inventory_hotels
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "inventory_hotels_select_authenticated"
  ON public.inventory_hotels
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.inventory_cities IS 'Generic inventory cities synced from supplier integrations';
COMMENT ON TABLE public.inventory_hotels IS 'Generic inventory hotels synced from supplier integrations';
