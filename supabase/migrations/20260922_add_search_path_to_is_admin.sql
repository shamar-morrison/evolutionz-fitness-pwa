-- Pin search_path on the SECURITY DEFINER is_admin() helper so it never
-- resolves objects via the caller's search_path. Body is unchanged from
-- supabase/migrations/20260412_fix_is_admin_role_check.sql; this file exists
-- instead of editing that already-applied migration.

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer set search_path = public;
