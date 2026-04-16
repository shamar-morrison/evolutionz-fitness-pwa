alter table public.push_subscriptions
add column if not exists last_used_at timestamptz not null default now();
