create table if not exists public.door_history_cache (
  cache_date date primary key,
  events jsonb not null default '[]',
  fetched_at timestamptz not null,
  total_matches integer not null default 0
);

alter table public.door_history_cache
enable row level security;

create policy "Admin full access to door_history_cache"
  on public.door_history_cache
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
