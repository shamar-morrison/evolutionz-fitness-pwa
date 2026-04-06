create table if not exists public.pt_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pt_sessions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  proposed_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pt_session_update_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pt_sessions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_status text not null check (requested_status in ('completed', 'missed')),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'reschedule_request',
      'reschedule_approved',
      'reschedule_denied',
      'client_assigned',
      'status_change_request'
    )
  ),
  title text not null,
  body text not null,
  read boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_read_idx
  on public.notifications (recipient_id, read, created_at desc);

create index if not exists pt_reschedule_requests_session_idx
  on public.pt_reschedule_requests (session_id);

create index if not exists pt_reschedule_requests_status_idx
  on public.pt_reschedule_requests (status, created_at desc);

create index if not exists pt_session_update_requests_session_idx
  on public.pt_session_update_requests (session_id);

create index if not exists pt_session_update_requests_status_idx
  on public.pt_session_update_requests (status, created_at desc);

alter table public.pt_reschedule_requests enable row level security;
alter table public.pt_session_update_requests enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "users can read their own reschedule requests"
on public.pt_reschedule_requests;
drop policy if exists "authenticated users can insert reschedule requests"
on public.pt_reschedule_requests;
drop policy if exists "admins can update reschedule requests"
on public.pt_reschedule_requests;

create policy "users can read their own reschedule requests"
  on public.pt_reschedule_requests for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

create policy "authenticated users can insert reschedule requests"
  on public.pt_reschedule_requests for insert to authenticated
  with check (requested_by = auth.uid());

create policy "admins can update reschedule requests"
  on public.pt_reschedule_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users can read their own session update requests"
on public.pt_session_update_requests;
drop policy if exists "authenticated users can insert session update requests"
on public.pt_session_update_requests;
drop policy if exists "admins can update session update requests"
on public.pt_session_update_requests;

create policy "users can read their own session update requests"
  on public.pt_session_update_requests for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

create policy "authenticated users can insert session update requests"
  on public.pt_session_update_requests for insert to authenticated
  with check (requested_by = auth.uid());

create policy "admins can update session update requests"
  on public.pt_session_update_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users can read their own notifications"
on public.notifications;
drop policy if exists "users can update their own notifications"
on public.notifications;
drop policy if exists "admins can insert notifications"
on public.notifications;
drop policy if exists "service_role can insert notifications"
on public.notifications;

create policy "users can read their own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "users can update their own notifications"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "admins can insert notifications"
  on public.notifications for insert to authenticated
  with check (public.is_admin());

create policy "service_role can insert notifications"
  on public.notifications for insert to service_role
  with check (true);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
