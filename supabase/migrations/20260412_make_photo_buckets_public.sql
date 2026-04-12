insert into storage.buckets (id, name, public)
values
  ('member-photos', 'member-photos', true),
  ('staff-photos', 'staff-photos', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;
