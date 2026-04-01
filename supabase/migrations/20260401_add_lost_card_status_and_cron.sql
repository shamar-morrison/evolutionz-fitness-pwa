alter table public.cards
drop constraint if exists cards_status_check;

alter table public.cards
add column if not exists lost_at timestamptz;

alter table public.cards
add constraint cards_status_check
check (status in ('available', 'assigned', 'suspended_lost', 'disabled'));

select cron.schedule(
  'expire-memberships',
  '0 5 * * *',
  $$update public.members set status = 'Expired'
    where end_time < now() and status = 'Active'$$
);

select cron.schedule(
  'disable-lost-cards',
  '0 5 * * *',
  $$update public.cards set status = 'disabled'
    where status = 'suspended_lost' and lost_at < now() - interval '5 days'$$
);

-- rollback
-- select cron.unschedule('expire-memberships');
-- select cron.unschedule('disable-lost-cards');
