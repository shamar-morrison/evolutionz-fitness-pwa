select cron.schedule(
  'cleanup-door-history-cache',
  '0 3 3 * *',
  $$
    delete from public.door_history_cache
    where cache_date < current_date - interval '90 days';
  $$
);
