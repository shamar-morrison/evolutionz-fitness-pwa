create table if not exists public.membership_expiry_email_settings (
  id integer primary key,
  enabled boolean not null default false,
  day_offsets integer[] not null default '{}',
  subject_template text not null default 'Your Evolutionz Fitness membership expires on {{expiry_date}}',
  body_template text not null default $$Hi {{member_name}},

This is a reminder that your Evolutionz Fitness membership will expire on {{expiry_date}}.

That is {{days_until_expiry}} day(s) from today.

If you would like to renew, please contact Evolutionz Fitness.

Evolutionz Fitness$$,
  last_run_status text not null default 'idle',
  last_run_started_at timestamptz,
  last_run_completed_at timestamptz,
  last_run_sent_count integer not null default 0,
  last_run_skipped_count integer not null default 0,
  last_run_duplicate_count integer not null default 0,
  last_run_error_count integer not null default 0,
  last_run_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_expiry_email_settings_singleton_check check (id = 1),
  constraint membership_expiry_email_settings_status_check check (
    last_run_status in ('idle', 'running', 'success', 'partial', 'failed')
  ),
  constraint membership_expiry_email_settings_sent_count_check check (last_run_sent_count >= 0),
  constraint membership_expiry_email_settings_skipped_count_check check (last_run_skipped_count >= 0),
  constraint membership_expiry_email_settings_duplicate_count_check check (last_run_duplicate_count >= 0),
  constraint membership_expiry_email_settings_error_count_check check (last_run_error_count >= 0)
);

alter table public.membership_expiry_email_settings
enable row level security;

create policy "Admin full access to membership_expiry_email_settings"
  on public.membership_expiry_email_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.membership_expiry_email_settings (id)
values (1)
on conflict (id) do nothing;

create trigger set_updated_at_membership_expiry_email_settings
  before update on public.membership_expiry_email_settings
  for each row execute function public.set_updated_at();

create table if not exists public.membership_expiry_email_sends (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  recipient_email text not null,
  member_end_time timestamptz not null,
  offset_days integer not null,
  provider_message_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint membership_expiry_email_sends_offset_days_check check (offset_days > 0),
  constraint membership_expiry_email_sends_unique_offset unique (member_id, member_end_time, offset_days)
);

alter table public.membership_expiry_email_sends
enable row level security;

create policy "Admin full access to membership_expiry_email_sends"
  on public.membership_expiry_email_sends
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
