drop policy if exists "Authenticated users can manage member_edit_requests"
on public.member_edit_requests;

drop policy if exists "Admins and requesters can read member_edit_requests"
on public.member_edit_requests;

drop policy if exists "Admins and requesters can insert member_edit_requests"
on public.member_edit_requests;

drop policy if exists "Admins can update member_edit_requests"
on public.member_edit_requests;

drop policy if exists "Admins can delete member_edit_requests"
on public.member_edit_requests;

create policy "Admins and requesters can read member_edit_requests"
  on public.member_edit_requests
  for select
  to authenticated
  using (public.is_admin() or auth.uid() = requested_by);

create policy "Admins and requesters can insert member_edit_requests"
  on public.member_edit_requests
  for insert
  to authenticated
  with check (public.is_admin() or auth.uid() = requested_by);

create policy "Admins can update member_edit_requests"
  on public.member_edit_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete member_edit_requests"
  on public.member_edit_requests
  for delete
  to authenticated
  using (public.is_admin());
