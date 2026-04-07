alter table public.notifications
add column if not exists archived_at timestamptz;

create index if not exists notifications_recipient_archived_read_idx
  on public.notifications (recipient_id, archived_at, read, created_at desc);
