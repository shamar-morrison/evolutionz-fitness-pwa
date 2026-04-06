create table if not exists public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  pt_fee integer not null,
  trainer_payout integer not null,
  sessions_per_week integer not null default 3 check (sessions_per_week between 1 and 3),
  scheduled_days text[] not null default '{}'::text[],
  session_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, member_id)
);

create table if not exists public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.trainer_clients(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'rescheduled')),
  is_recurring boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, scheduled_at)
);

create table if not exists public.pt_session_changes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pt_sessions(id) on delete cascade,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  change_type text not null check (change_type in ('reschedule', 'cancellation', 'status_change')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trainer_clients_member_status_idx
  on public.trainer_clients (member_id, status);

create index if not exists trainer_clients_trainer_status_idx
  on public.trainer_clients (trainer_id, status);

create index if not exists pt_sessions_assignment_scheduled_at_idx
  on public.pt_sessions (assignment_id, scheduled_at);

create index if not exists pt_sessions_trainer_member_scheduled_at_idx
  on public.pt_sessions (trainer_id, member_id, scheduled_at);

create index if not exists pt_session_changes_session_created_at_idx
  on public.pt_session_changes (session_id, created_at desc);

alter table public.trainer_clients enable row level security;
alter table public.pt_sessions enable row level security;
alter table public.pt_session_changes enable row level security;

drop policy if exists "authenticated users can read trainer_clients" on public.trainer_clients;
drop policy if exists "admins can insert trainer_clients" on public.trainer_clients;
drop policy if exists "admins can update trainer_clients" on public.trainer_clients;
drop policy if exists "admins can delete trainer_clients" on public.trainer_clients;

create policy "authenticated users can read trainer_clients"
on public.trainer_clients
for select
to authenticated
using (true);

create policy "admins can insert trainer_clients"
on public.trainer_clients
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update trainer_clients"
on public.trainer_clients
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete trainer_clients"
on public.trainer_clients
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated users can read pt_sessions" on public.pt_sessions;
drop policy if exists "admins can insert pt_sessions" on public.pt_sessions;
drop policy if exists "admins can update pt_sessions" on public.pt_sessions;
drop policy if exists "admins can delete pt_sessions" on public.pt_sessions;

create policy "authenticated users can read pt_sessions"
on public.pt_sessions
for select
to authenticated
using (true);

create policy "admins can insert pt_sessions"
on public.pt_sessions
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update pt_sessions"
on public.pt_sessions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete pt_sessions"
on public.pt_sessions
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated users can read pt_session_changes" on public.pt_session_changes;
drop policy if exists "admins can insert pt_session_changes" on public.pt_session_changes;

create policy "authenticated users can read pt_session_changes"
on public.pt_session_changes
for select
to authenticated
using (true);

create policy "admins can insert pt_session_changes"
on public.pt_session_changes
for insert
to authenticated
with check (public.is_admin());

comment on column public.trainer_clients.scheduled_days is 'Day names such as Monday, Tuesday, etc.';
comment on column public.trainer_clients.session_time is 'Time of day stored without timezone, e.g. 07:00:00.';
comment on column public.pt_sessions.scheduled_at is 'Full Jamaica-local timestamptz built by combining the scheduled calendar date with session_time and the -05:00 offset.';
