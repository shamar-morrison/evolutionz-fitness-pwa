select cron.unschedule('cleanup-push-subscriptions');

select cron.schedule(
  'cleanup-push-subscriptions',
  '0 3 4 * *',
  $$
    delete from public.push_subscriptions
    where last_used_at < now() - interval '60 days';
  $$
);
