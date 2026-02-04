create table if not exists public.mygo_cities (
  id text primary key,
  name text not null,
  region text
);

create table if not exists public.mygo_hotels (
  id text primary key,
  name text not null,
  city_id text references public.mygo_cities(id),
  stars integer,
  category text,
  image_url text
);

create table if not exists public.suppliers_config (
  id bigserial primary key,
  name text not null unique,
  is_enabled boolean not null default true,
  prod_url text,
  test_url text
);

insert into public.suppliers_config (name, is_enabled, prod_url, test_url)
values ('MyGo', true, 'https://admin.mygo.co/api/hotel/', 'https://admin.mygo.co/api/hotel/')
on conflict (name) do update
set is_enabled = excluded.is_enabled,
    prod_url = excluded.prod_url,
    test_url = excluded.test_url;
