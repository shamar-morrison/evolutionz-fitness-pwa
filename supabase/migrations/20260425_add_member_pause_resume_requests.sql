create table public.member_pause_resume_requests (
  id uuid primary key default gen_random_uuid(),
  pause_id uuid not null references public.member_pauses(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  review_timestamp timestamptz,
  created_at timestamptz not null default now()
);

alter table public.member_pause_resume_requests enable row level security;

create policy "Admins full access" on public.member_pause_resume_requests
  for all using (public.is_admin());

create policy "Staff can insert own requests" on public.member_pause_resume_requests
  for insert with check (requested_by = auth.uid());

create policy "Staff can read requests" on public.member_pause_resume_requests
  for select using (auth.role() = 'authenticated');

create unique index member_pause_resume_requests_pending_pause_idx
  on public.member_pause_resume_requests (pause_id)
  where status = 'pending';

create index member_pause_resume_requests_status_created_at_idx
  on public.member_pause_resume_requests (status, created_at desc);

create index member_pause_resume_requests_pause_id_idx
  on public.member_pause_resume_requests (pause_id);

create index member_pause_resume_requests_member_id_idx
  on public.member_pause_resume_requests (member_id);

create index member_pause_resume_requests_requested_by_idx
  on public.member_pause_resume_requests (requested_by);
