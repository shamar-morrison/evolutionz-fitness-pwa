-- Create the profiles table used to store staff metadata and application roles.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')),
  title text,
  created_at timestamptz default now()
);

-- Create a helper function that checks whether the current authenticated user is an admin.
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- Enable RLS on profiles and allow users to read themselves, admins to read all, and service_role to manage rows.
alter table public.profiles enable row level security;

drop policy if exists "authenticated users can read their own profile" on public.profiles;
drop policy if exists "admins can read all profiles" on public.profiles;
drop policy if exists "service_role can insert profiles" on public.profiles;
drop policy if exists "service_role can update profiles" on public.profiles;
drop policy if exists "service_role can delete profiles" on public.profiles;

create policy "authenticated users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "service_role can insert profiles"
on public.profiles
for insert
to service_role
with check (true);

create policy "service_role can update profiles"
on public.profiles
for update
to service_role
using (true)
with check (true);

create policy "service_role can delete profiles"
on public.profiles
for delete
to service_role
using (true);

-- Enable RLS on members and allow authenticated reads with admin-only writes.
alter table public.members enable row level security;

drop policy if exists "authenticated users can read members" on public.members;
drop policy if exists "admins can insert members" on public.members;
drop policy if exists "admins can update members" on public.members;
drop policy if exists "admins can delete members" on public.members;

create policy "authenticated users can read members"
on public.members
for select
to authenticated
using (true);

create policy "admins can insert members"
on public.members
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update members"
on public.members
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete members"
on public.members
for delete
to authenticated
using (public.is_admin());

-- Enable RLS on cards and allow authenticated reads with admin-only writes.
alter table public.cards enable row level security;

drop policy if exists "authenticated users can read cards" on public.cards;
drop policy if exists "admins can insert cards" on public.cards;
drop policy if exists "admins can update cards" on public.cards;
drop policy if exists "admins can delete cards" on public.cards;

create policy "authenticated users can read cards"
on public.cards
for select
to authenticated
using (true);

create policy "admins can insert cards"
on public.cards
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update cards"
on public.cards
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete cards"
on public.cards
for delete
to authenticated
using (public.is_admin());

-- Enable RLS on access_control_jobs and allow authenticated reads/inserts with admin-only deletes.
alter table public.access_control_jobs enable row level security;

drop policy if exists "authenticated users can read access control jobs" on public.access_control_jobs;
drop policy if exists "authenticated users can insert access control jobs" on public.access_control_jobs;
drop policy if exists "admins can delete access control jobs" on public.access_control_jobs;

create policy "authenticated users can read access control jobs"
on public.access_control_jobs
for select
to authenticated
using (true);

create policy "authenticated users can insert access control jobs"
on public.access_control_jobs
for insert
to authenticated
with check (true);

create policy "admins can delete access control jobs"
on public.access_control_jobs
for delete
to authenticated
using (public.is_admin());
