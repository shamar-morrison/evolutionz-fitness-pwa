create table if not exists public.member_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_rate numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.member_types is
  'Configurable membership types with monthly rates in JMD. Rates can be edited by admin but types cannot be deleted to preserve historical payment data.';

comment on column public.member_types.monthly_rate is
  'Monthly membership rate in JMD.';

alter table public.member_types enable row level security;

drop policy if exists "admins can read member_types" on public.member_types;
drop policy if exists "admins can insert member_types" on public.member_types;
drop policy if exists "admins can update member_types" on public.member_types;
drop policy if exists "admins can delete member_types" on public.member_types;
drop policy if exists "staff can read member_types" on public.member_types;

create policy "admins can read member_types"
on public.member_types
for select
to authenticated
using (public.is_admin());

create policy "admins can insert member_types"
on public.member_types
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update member_types"
on public.member_types
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete member_types"
on public.member_types
for delete
to authenticated
using (public.is_admin());

create policy "staff can read member_types"
on public.member_types
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

insert into public.member_types (
  name,
  monthly_rate
) values
  ('General', 12000),
  ('Civil Servant', 7500),
  ('Student/BPO', 7500)
on conflict (name) do nothing;

create table if not exists public.member_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  member_type_id uuid not null references public.member_types(id) on delete restrict,
  payment_method text not null check (
    payment_method in ('cash', 'fygaro', 'bank_transfer', 'point_of_sale')
  ),
  amount_paid numeric(10,2) not null,
  promotion text,
  recorded_by uuid references public.profiles(id) on delete set null,
  payment_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.member_payments is
  'Payment records for member registrations and renewals. Recorded manually at point of payment. No backfill for historical payments.';

comment on column public.member_payments.payment_date is
  'Date payment was received in Jamaica local time (-05:00). Not a calendar month boundary.';

comment on column public.member_payments.amount_paid is
  'Amount paid in JMD.';

comment on column public.member_payments.promotion is
  'Optional free-form promotion label. Multiple promotions may exist simultaneously.';

comment on column public.member_payments.payment_method is
  'cash | fygaro | bank_transfer | point_of_sale';

alter table public.member_payments enable row level security;

drop policy if exists "admins can read member_payments" on public.member_payments;
drop policy if exists "admins can insert member_payments" on public.member_payments;
drop policy if exists "admins can update member_payments" on public.member_payments;
drop policy if exists "admins can delete member_payments" on public.member_payments;
drop policy if exists "staff can read member_payments" on public.member_payments;
drop policy if exists "staff can insert member_payments" on public.member_payments;

create policy "admins can read member_payments"
on public.member_payments
for select
to authenticated
using (public.is_admin());

create policy "admins can insert member_payments"
on public.member_payments
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update member_payments"
on public.member_payments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete member_payments"
on public.member_payments
for delete
to authenticated
using (public.is_admin());

create policy "staff can read member_payments"
on public.member_payments
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

create policy "staff can insert member_payments"
on public.member_payments
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

alter table public.members
add column if not exists member_type_id uuid references public.member_types(id) on delete set null;

comment on column public.members.member_type_id is
  'Membership type for this member. Null for members synced before this feature was introduced.';
