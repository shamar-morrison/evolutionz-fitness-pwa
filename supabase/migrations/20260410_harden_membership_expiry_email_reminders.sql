create or replace function public.membership_expiry_email_day_offsets_are_valid(offsets integer[])
returns boolean
language sql
immutable
as $$
  select
    coalesce(bool_and(x > 0), true)
    and count(*) = count(distinct x)
  from unnest(offsets) as x
$$;

alter table public.membership_expiry_email_settings
add constraint membership_expiry_email_settings_day_offsets_check
check (public.membership_expiry_email_day_offsets_are_valid(day_offsets));

alter table public.membership_expiry_email_sends
add column status text not null default 'pending';

alter table public.membership_expiry_email_sends
alter column sent_at drop not null;

alter table public.membership_expiry_email_sends
alter column sent_at drop default;

alter table public.membership_expiry_email_sends
add constraint membership_expiry_email_sends_status_check
check (status in ('pending', 'sent'));
