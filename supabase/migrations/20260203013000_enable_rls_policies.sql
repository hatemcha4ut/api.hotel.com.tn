-- Enable RLS
alter table public.hotels enable row level security;
alter table public.room_types enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_rooms enable row level security;
alter table public.payments enable row level security;

-- HOTELS: SELECT for anon + authenticated
create policy "hotels_select_anon"
on public.hotels
for select
to anon
using (true);

create policy "hotels_select_authenticated"
on public.hotels
for select
to authenticated
using (true);

-- ROOM_TYPES: SELECT for anon + authenticated
create policy "room_types_select_anon"
on public.room_types
for select
to anon
using (true);

create policy "room_types_select_authenticated"
on public.room_types
for select
to authenticated
using (true);

-- BOOKINGS: SELECT/INSERT/UPDATE/DELETE only for owner
create policy "bookings_select_own"
on public.bookings
for select
to authenticated
using (auth.uid() = user_id);

create policy "bookings_insert_own"
on public.bookings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "bookings_update_own"
on public.bookings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "bookings_delete_own"
on public.bookings
for delete
to authenticated
using (auth.uid() = user_id);

-- BOOKING_ROOMS: SELECT/INSERT/UPDATE/DELETE only if booking owner
create policy "booking_rooms_select_own"
on public.booking_rooms
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_rooms.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "booking_rooms_insert_own"
on public.booking_rooms
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_rooms.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "booking_rooms_update_own"
on public.booking_rooms
for update
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_rooms.booking_id
      and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_rooms.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "booking_rooms_delete_own"
on public.booking_rooms
for delete
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_rooms.booking_id
      and b.user_id = auth.uid()
  )
);

-- PAYMENTS: SELECT/INSERT/UPDATE/DELETE only if booking owner
create policy "payments_select_own"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "payments_insert_own"
on public.payments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "payments_update_own"
on public.payments
for update
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.user_id = auth.uid()
  )
);

create policy "payments_delete_own"
on public.payments
for delete
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = payments.booking_id
      and b.user_id = auth.uid()
  )
);

-- ADMIN: can SELECT everything (backoffice)
create policy "admin_hotels_select_all"
on public.hotels
for select
to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

create policy "admin_room_types_select_all"
on public.room_types
for select
to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

create policy "admin_bookings_select_all"
on public.bookings
for select
to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

create policy "admin_booking_rooms_select_all"
on public.booking_rooms
for select
to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

create policy "admin_payments_select_all"
on public.payments
for select
to authenticated
using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
