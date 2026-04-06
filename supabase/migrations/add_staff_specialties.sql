alter table public.profiles
add column if not exists specialties text[] not null default '{}'::text[];
