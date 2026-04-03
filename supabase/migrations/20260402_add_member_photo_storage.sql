insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "service_role can read member photos" on storage.objects;
drop policy if exists "service_role can insert member photos" on storage.objects;
drop policy if exists "service_role can update member photos" on storage.objects;
drop policy if exists "service_role can delete member photos" on storage.objects;

create policy "service_role can read member photos"
on storage.objects
for select
to service_role
using (bucket_id = 'member-photos');

create policy "service_role can insert member photos"
on storage.objects
for insert
to service_role
with check (bucket_id = 'member-photos');

create policy "service_role can update member photos"
on storage.objects
for update
to service_role
using (bucket_id = 'member-photos')
with check (bucket_id = 'member-photos');

create policy "service_role can delete member photos"
on storage.objects
for delete
to service_role
using (bucket_id = 'member-photos');
