drop policy if exists "Authenticated users can manage member_edit_requests"
on public.member_edit_requests;

create policy "Authenticated users can manage member_edit_requests"
  on public.member_edit_requests
  for all
  to authenticated
  using (public.is_admin() or auth.uid() = requested_by)
  with check (public.is_admin() or auth.uid() = requested_by);
