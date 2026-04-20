create table if not exists public.class_registration_edit_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.class_registrations(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  proposed_fee_type text check (proposed_fee_type in ('monthly', 'per_session', 'custom')),
  proposed_amount_paid integer not null check (proposed_amount_paid >= 0),
  proposed_period_start date not null,
  proposed_payment_received boolean not null,
  proposed_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  review_timestamp timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.class_registration_removal_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.class_registrations(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  amount_paid_at_request integer not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  review_timestamp timestamptz,
  created_at timestamptz not null default now()
);

alter table public.class_registration_edit_requests
enable row level security;

alter table public.class_registration_removal_requests
enable row level security;

drop policy if exists "Admin full access to class_registration_edit_requests"
on public.class_registration_edit_requests;

drop policy if exists "Staff can read class_registration_edit_requests"
on public.class_registration_edit_requests;

drop policy if exists "Staff can insert own class_registration_edit_requests"
on public.class_registration_edit_requests;

create policy "Admin full access to class_registration_edit_requests"
  on public.class_registration_edit_requests
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Staff can read class_registration_edit_requests"
  on public.class_registration_edit_requests
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

create policy "Staff can insert own class_registration_edit_requests"
  on public.class_registration_edit_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
    )
    and not public.is_admin()
    and requested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and review_timestamp is null
  );

drop policy if exists "Admin full access to class_registration_removal_requests"
on public.class_registration_removal_requests;

drop policy if exists "Staff can read class_registration_removal_requests"
on public.class_registration_removal_requests;

drop policy if exists "Staff can insert own class_registration_removal_requests"
on public.class_registration_removal_requests;

create policy "Admin full access to class_registration_removal_requests"
  on public.class_registration_removal_requests
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Staff can read class_registration_removal_requests"
  on public.class_registration_removal_requests
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

create policy "Staff can insert own class_registration_removal_requests"
  on public.class_registration_removal_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
    )
    and not public.is_admin()
    and requested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and review_timestamp is null
  );

create index if not exists class_registration_edit_requests_status_created_at_idx
  on public.class_registration_edit_requests (status, created_at desc);

create index if not exists class_registration_edit_requests_registration_id_idx
  on public.class_registration_edit_requests (registration_id);

create index if not exists class_registration_edit_requests_requested_by_idx
  on public.class_registration_edit_requests (requested_by);

create index if not exists class_registration_removal_requests_status_created_at_idx
  on public.class_registration_removal_requests (status, created_at desc);

create index if not exists class_registration_removal_requests_registration_id_idx
  on public.class_registration_removal_requests (registration_id);

create index if not exists class_registration_removal_requests_requested_by_idx
  on public.class_registration_removal_requests (requested_by);
