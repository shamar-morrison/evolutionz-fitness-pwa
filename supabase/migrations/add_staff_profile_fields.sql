alter table public.profiles
add column if not exists phone text,
add column if not exists gender text,
add column if not exists remark text,
add column if not exists photo_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_check'
  ) then
    alter table public.profiles
    add constraint profiles_gender_check
    check (gender in ('male', 'female', 'other'));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "service_role can read staff photos" on storage.objects;
drop policy if exists "service_role can insert staff photos" on storage.objects;
drop policy if exists "service_role can update staff photos" on storage.objects;
drop policy if exists "service_role can delete staff photos" on storage.objects;

create policy "service_role can read staff photos"
on storage.objects
for select
to service_role
using (bucket_id = 'staff-photos');

create policy "service_role can insert staff photos"
on storage.objects
for insert
to service_role
with check (bucket_id = 'staff-photos');

create policy "service_role can update staff photos"
on storage.objects
for update
to service_role
using (bucket_id = 'staff-photos')
with check (bucket_id = 'staff-photos');

create policy "service_role can delete staff photos"
on storage.objects
for delete
to service_role
using (bucket_id = 'staff-photos');
