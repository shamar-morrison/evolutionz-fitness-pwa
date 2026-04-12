create table public.member_payment_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  amount numeric(10,2) not null,
  payment_method text not null,
  payment_date date not null,
  member_type_id uuid references public.member_types(id),
  notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_payment_requests_status_check
    check (status in ('pending', 'approved', 'denied')),
  constraint member_payment_requests_payment_method_check
    check (payment_method in ('cash', 'fygaro', 'bank_transfer', 'point_of_sale'))
);

alter table public.member_payment_requests enable row level security;

create policy "Authenticated users can manage member_payment_requests"
  on public.member_payment_requests
  for all
  to authenticated
  using (true)
  with check (public.is_admin() or auth.uid() = requested_by);

create trigger set_updated_at_member_payment_requests
  before update on public.member_payment_requests
  for each row execute function public.set_updated_at();
