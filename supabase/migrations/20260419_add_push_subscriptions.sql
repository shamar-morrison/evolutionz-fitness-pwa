create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, endpoint)
);

create index if not exists push_subscriptions_profile_id_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

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
