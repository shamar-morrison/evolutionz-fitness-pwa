create table public.member_edit_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  proposed_name text,
  proposed_gender text,
  proposed_phone text,
  proposed_email text,
  proposed_member_type_id uuid references public.member_types(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_edit_requests_status_check
    check (status in ('pending', 'approved', 'denied'))
);

alter table public.member_edit_requests enable row level security;

create policy "Authenticated users can manage member_edit_requests"
  on public.member_edit_requests
  for all
  to authenticated
  using (true)
  with check (public.is_admin() or auth.uid() = requested_by);

create trigger set_updated_at_member_edit_requests
  before update on public.member_edit_requests
  for each row execute function public.set_updated_at();
