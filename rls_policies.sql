alter table bookings enable row level security;
alter table payments enable row level security;

create policy "hotels_select" on hotels
for select
to anon, authenticated
using (true);

create policy "room_types_select" on room_types
for select
to anon, authenticated
using (true);

create policy "bookings_select" on bookings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "bookings_insert" on bookings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "bookings_update" on bookings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Profiles table policies
alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_own" on profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles_update_own" on profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
