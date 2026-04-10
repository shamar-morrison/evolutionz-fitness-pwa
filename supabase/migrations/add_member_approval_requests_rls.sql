alter table public.member_approval_requests enable row level security;

drop policy if exists "admins can read member_approval_requests" on public.member_approval_requests;
drop policy if exists "admins can insert member_approval_requests" on public.member_approval_requests;
drop policy if exists "admins can update member_approval_requests" on public.member_approval_requests;
drop policy if exists "admins can delete member_approval_requests" on public.member_approval_requests;
drop policy if exists "staff can read member_approval_requests" on public.member_approval_requests;
drop policy if exists "staff can insert member_approval_requests" on public.member_approval_requests;

create policy "admins can read member_approval_requests"
on public.member_approval_requests
for select
to authenticated
using (public.is_admin());

create policy "admins can insert member_approval_requests"
on public.member_approval_requests
for insert
to authenticated
with check (public.is_admin());

create policy "admins can update member_approval_requests"
on public.member_approval_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete member_approval_requests"
on public.member_approval_requests
for delete
to authenticated
using (public.is_admin());

create policy "staff can read member_approval_requests"
on public.member_approval_requests
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
  )
  and not public.is_admin()
);

create policy "staff can insert member_approval_requests"
on public.member_approval_requests
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
