create table public.member_pauses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  original_end_time timestamptz not null,
  pause_start_date date not null,
  planned_resume_date date not null,
  actual_resume_date date,
  status text not null default 'active' check (status in ('active', 'resumed', 'cancelled')),
  applied_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.member_pauses enable row level security;

create policy "Admins full access" on public.member_pauses
  for all using (public.is_admin());

create policy "Staff can read pauses" on public.member_pauses
  for select using (auth.role() = 'authenticated');

create unique index member_pauses_one_active_per_member_idx
  on public.member_pauses (member_id)
  where status = 'active';

create index member_pauses_status_idx
  on public.member_pauses (status);

create index member_pauses_member_id_idx
  on public.member_pauses (member_id);

create index member_pauses_planned_resume_date_idx
  on public.member_pauses (planned_resume_date)
  where status = 'active';
