alter table public.class_registrations
add column if not exists status text not null default 'approved'
check (status in ('pending', 'approved', 'denied'));

alter table public.class_registrations
add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.class_registrations
add column if not exists reviewed_at timestamptz;

alter table public.class_registrations
add column if not exists review_note text;

comment on column public.class_registrations.status is
  'pending = submitted by staff awaiting admin approval; approved = active registration; denied = rejected by admin.';

drop policy if exists "staff can insert class_registrations" on public.class_registrations;

create policy "staff can insert class_registrations"
on public.class_registrations
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
  and status = 'pending'
);
