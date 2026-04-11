-- TODO: Rows older than 30 days should be pruned periodically to
-- prevent unbounded table growth. A pg_cron job or Supabase Edge
-- Function scheduled monthly is the recommended approach.

create table if not exists public.admin_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles (id) on delete cascade,
  send_date date not null,
  idempotency_key uuid not null,
  recipient_email text not null,
  status text not null default 'pending',
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_email_deliveries_status_check check (status in ('pending', 'sent')),
  constraint admin_email_deliveries_idempotency_recipient_unique unique (idempotency_key, recipient_email)
);

create index if not exists admin_email_deliveries_sender_date_status_idx
  on public.admin_email_deliveries (sender_profile_id, send_date, status);

alter table public.admin_email_deliveries
enable row level security;

create policy "Admin full access to admin_email_deliveries"
  on public.admin_email_deliveries
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
