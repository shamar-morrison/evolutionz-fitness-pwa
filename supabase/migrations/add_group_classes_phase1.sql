create table if not exists public.guest_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  remark text,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  schedule_description text not null,
  per_session_fee numeric(10,2),
  monthly_fee numeric(10,2),
  trainer_compensation_pct numeric(5,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.class_trainers (
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, profile_id)
);

create table if not exists public.class_registrations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  member_id uuid references public.members(id) on delete restrict,
  guest_profile_id uuid references public.guest_profiles(id) on delete restrict,
  month_start date not null,
  amount_paid numeric(10,2) not null default 0,
  payment_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint class_registrations_registrant_check
    check (
      (member_id is not null and guest_profile_id is null)
      or (member_id is null and guest_profile_id is not null)
    ),
  constraint class_registrations_unique_member
    unique (class_id, member_id, month_start),
  constraint class_registrations_unique_guest
    unique (class_id, guest_profile_id, month_start)
);

alter table public.guest_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_trainers enable row level security;
alter table public.class_registrations enable row level security;

drop policy if exists "admins can read guest_profiles" on public.guest_profiles;
drop policy if exists "admins can insert guest_profiles" on public.guest_profiles;
drop policy if exists "admins can update guest_profiles" on public.guest_profiles;
drop policy if exists "admins can delete guest_profiles" on public.guest_profiles;
drop policy if exists "staff can read guest_profiles" on public.guest_profiles;

create policy "admins can read guest_profiles"
on public.guest_profiles
for select
to authenticated
using (public.is_admin());

create policy "admins can insert guest_profiles"
on public.guest_profiles
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update guest_profiles"
on public.guest_profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete guest_profiles"
on public.guest_profiles
for delete
to authenticated
using (public.is_admin());

create policy "staff can read guest_profiles"
on public.guest_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

drop policy if exists "admins can read classes" on public.classes;
drop policy if exists "admins can insert classes" on public.classes;
drop policy if exists "admins can update classes" on public.classes;
drop policy if exists "admins can delete classes" on public.classes;
drop policy if exists "staff can read classes" on public.classes;

create policy "admins can read classes"
on public.classes
for select
to authenticated
using (public.is_admin());

create policy "admins can insert classes"
on public.classes
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update classes"
on public.classes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete classes"
on public.classes
for delete
to authenticated
using (public.is_admin());

create policy "staff can read classes"
on public.classes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

drop policy if exists "admins can read class_trainers" on public.class_trainers;
drop policy if exists "admins can insert class_trainers" on public.class_trainers;
drop policy if exists "admins can update class_trainers" on public.class_trainers;
drop policy if exists "admins can delete class_trainers" on public.class_trainers;
drop policy if exists "staff can read class_trainers" on public.class_trainers;

create policy "admins can read class_trainers"
on public.class_trainers
for select
to authenticated
using (public.is_admin());

create policy "admins can insert class_trainers"
on public.class_trainers
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update class_trainers"
on public.class_trainers
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete class_trainers"
on public.class_trainers
for delete
to authenticated
using (public.is_admin());

create policy "staff can read class_trainers"
on public.class_trainers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

drop policy if exists "admins can read class_registrations" on public.class_registrations;
drop policy if exists "admins can insert class_registrations" on public.class_registrations;
drop policy if exists "admins can update class_registrations" on public.class_registrations;
drop policy if exists "admins can delete class_registrations" on public.class_registrations;
drop policy if exists "staff can read class_registrations" on public.class_registrations;
drop policy if exists "staff can insert class_registrations" on public.class_registrations;

create policy "admins can read class_registrations"
on public.class_registrations
for select
to authenticated
using (public.is_admin());

create policy "admins can insert class_registrations"
on public.class_registrations
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update class_registrations"
on public.class_registrations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete class_registrations"
on public.class_registrations
for delete
to authenticated
using (public.is_admin());

create policy "staff can read class_registrations"
on public.class_registrations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

create policy "staff can insert class_registrations"
on public.class_registrations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

insert into public.classes (
  name,
  schedule_description,
  per_session_fee,
  monthly_fee,
  trainer_compensation_pct
) values
  ('Weight Loss Club', '3 times per week', null, 15500, 30),
  ('Bootcamp', 'Every Saturday', 1500, 5500, 40),
  ('Dance Cardio', 'Every Thursday', 1000, 4000, 40)
on conflict (name) do nothing;

comment on column public.classes.per_session_fee is 'Class fee amount stored in JMD.';
comment on column public.classes.monthly_fee is 'Class fee amount stored in JMD.';
comment on column public.class_registrations.amount_paid is 'Registration payment amount stored in JMD.';
comment on column public.class_registrations.month_start is
  'First day of a 28-day billing window in Jamaica time (-05:00); not a calendar month.';

comment on table public.class_trainers is
  'Trainer assignments are intentionally not seeded in migrations because profiles.id values are environment-specific and must be linked after staff profiles exist.';
