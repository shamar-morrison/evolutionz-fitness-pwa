select cron.schedule(
  'cleanup-admin-email-deliveries',
  '0 3 2 * *',
  $$
    delete from public.admin_email_deliveries
    where created_at < now() - interval '30 days';
  $$
);
