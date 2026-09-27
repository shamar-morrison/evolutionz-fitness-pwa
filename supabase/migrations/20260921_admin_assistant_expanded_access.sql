-- Grant Administrative Assistants access to member email sending,
-- door history viewing/fetching, PT assignment management, and the
-- staff directory read needed to pick trainers in the Assign Trainer dialog.
-- Existing admin-only (is_admin()) policies are left intact; the policies
-- below are additive (permissive policies are OR-ed together).

create or replace function public.is_administrative_assistant()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and 'Administrative Assistant' = any(titles)
  );
$$;

-- Email sending (admin_email_deliveries: send flow reads/writes deliveries)
drop policy if exists "administrative assistants full access to admin_email_deliveries"
  on public.admin_email_deliveries;

create policy "administrative assistants full access to admin_email_deliveries"
  on public.admin_email_deliveries
  for all
  to authenticated
  using (public.is_administrative_assistant())
  with check (public.is_administrative_assistant());

-- Email quota also counts membership_expiry_email_sends (read-only need)
drop policy if exists "administrative assistants can read membership_expiry_email_sends"
  on public.membership_expiry_email_sends;

create policy "administrative assistants can read membership_expiry_email_sends"
  on public.membership_expiry_email_sends
  for select
  to authenticated
  using (public.is_administrative_assistant());

-- Door history (view log + trigger device fetch, which upserts the cache)
drop policy if exists "administrative assistants full access to door_history_cache"
  on public.door_history_cache;

create policy "administrative assistants full access to door_history_cache"
  on public.door_history_cache
  for all
  to authenticated
  using (public.is_administrative_assistant())
  with check (public.is_administrative_assistant());

-- PT assignments (create / edit / delete)
drop policy if exists "administrative assistants can insert trainer_clients"
  on public.trainer_clients;
drop policy if exists "administrative assistants can update trainer_clients"
  on public.trainer_clients;
drop policy if exists "administrative assistants can delete trainer_clients"
  on public.trainer_clients;

create policy "administrative assistants can insert trainer_clients"
  on public.trainer_clients
  for insert
  to authenticated
  with check (public.is_administrative_assistant());

create policy "administrative assistants can update trainer_clients"
  on public.trainer_clients
  for update
  to authenticated
  using (public.is_administrative_assistant())
  with check (public.is_administrative_assistant());

create policy "administrative assistants can delete trainer_clients"
  on public.trainer_clients
  for delete
  to authenticated
  using (public.is_administrative_assistant());

-- PT sessions (generate-sessions inserts; removal cancels future sessions)
drop policy if exists "administrative assistants can insert pt_sessions"
  on public.pt_sessions;
drop policy if exists "administrative assistants can update pt_sessions"
  on public.pt_sessions;

create policy "administrative assistants can insert pt_sessions"
  on public.pt_sessions
  for insert
  to authenticated
  with check (public.is_administrative_assistant());

create policy "administrative assistants can update pt_sessions"
  on public.pt_sessions
  for update
  to authenticated
  using (public.is_administrative_assistant())
  with check (public.is_administrative_assistant());

-- Training plan days (created alongside assignments; replaced on schedule edit)
drop policy if exists "administrative assistants can insert training_plan_days"
  on public.training_plan_days;
drop policy if exists "administrative assistants can update training_plan_days"
  on public.training_plan_days;
drop policy if exists "administrative assistants can delete training_plan_days"
  on public.training_plan_days;

create policy "administrative assistants can insert training_plan_days"
  on public.training_plan_days
  for insert
  to authenticated
  with check (public.is_administrative_assistant());

create policy "administrative assistants can update training_plan_days"
  on public.training_plan_days
  for update
  to authenticated
  using (public.is_administrative_assistant())
  with check (public.is_administrative_assistant());

create policy "administrative assistants can delete training_plan_days"
  on public.training_plan_days
  for delete
  to authenticated
  using (public.is_administrative_assistant());

-- Staff directory (GET /api/staff reads through the caller's own client,
-- so the Assign Trainer dialog needs this to list trainers; read-only)
drop policy if exists "administrative assistants can read all profiles"
  on public.profiles;

create policy "administrative assistants can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_administrative_assistant());

-- Privileges: no direct access for public/anon; authenticated keeps the
-- table privileges its RLS policies are written against.
revoke all on table public.admin_email_deliveries from public, anon;
revoke all on table public.membership_expiry_email_sends from public, anon;
revoke all on table public.door_history_cache from public, anon;
revoke all on table public.trainer_clients from public, anon;
revoke all on table public.pt_sessions from public, anon;
revoke all on table public.training_plan_days from public, anon;
revoke all on table public.profiles from public, anon;

grant select, insert, update, delete on table public.admin_email_deliveries to authenticated;
grant select on table public.membership_expiry_email_sends to authenticated;
grant select, insert, update, delete on table public.door_history_cache to authenticated;
grant select, insert, update, delete on table public.trainer_clients to authenticated;
grant select, insert, update, delete on table public.pt_sessions to authenticated;
grant select, insert, update, delete on table public.training_plan_days to authenticated;
grant select on table public.profiles to authenticated;

revoke all on function public.is_administrative_assistant()
  from public, anon, authenticated;

grant execute on function public.is_administrative_assistant()
  to authenticated, service_role;
