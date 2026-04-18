create table public.member_pause_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  duration_days integer not null check (duration_days >= 7 and duration_days <= 364),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  review_timestamp timestamptz,
  created_at timestamptz not null default now()
);

alter table public.member_pause_requests enable row level security;

create policy "Admins full access" on public.member_pause_requests
  for all using (public.is_admin());

create policy "Staff can insert own requests" on public.member_pause_requests
  for insert with check (requested_by = auth.uid());

create policy "Staff can read requests" on public.member_pause_requests
  for select using (auth.role() = 'authenticated');

create index member_pause_requests_status_created_at_idx
  on public.member_pause_requests (status, created_at desc);

create index member_pause_requests_member_id_created_at_idx
  on public.member_pause_requests (member_id, created_at desc);

create index member_pause_requests_requested_by_idx
  on public.member_pause_requests (requested_by);
