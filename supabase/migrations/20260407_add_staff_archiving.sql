alter table public.profiles
add column if not exists archived_at timestamptz;

create index if not exists profiles_archived_at_idx
  on public.profiles (archived_at, created_at);
