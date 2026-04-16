select cron.schedule(
  'cleanup-access-control-jobs',
  '0 3 * * 0',
  $$
    delete from public.access_control_jobs
    where status in ('done', 'failed')
      and created_at < now() - interval '7 days';
  $$
);
