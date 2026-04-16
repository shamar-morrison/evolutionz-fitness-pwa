select cron.schedule(
  'cleanup-archived-notifications',
  '0 3 1 * *',
  $$
    delete from public.notifications
    where archived_at is not null
      and archived_at < now() - interval '30 days';
  $$
);
