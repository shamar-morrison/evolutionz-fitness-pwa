drop policy if exists "authenticated users can read their own push subscriptions"
  on public.push_subscriptions;
drop policy if exists "authenticated users can delete their own push subscriptions"
  on public.push_subscriptions;
drop policy if exists "service role has full access to push subscriptions"
  on public.push_subscriptions;

create policy "authenticated users can read their own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (profile_id = auth.uid());

create policy "authenticated users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (profile_id = auth.uid());

create policy "service role has full access to push subscriptions"
  on public.push_subscriptions for all
  to service_role
  using (true)
  with check (true);
