create or replace function public.delete_pt_sessions_and_archive_notifications(
  session_ids uuid[],
  archived_at timestamptz
)
returns void
language plpgsql
as $$
declare
  target_session_ids uuid[] := coalesce(session_ids, '{}'::uuid[]);
  target_session_id_texts text[] := array(
    select unnest(target_session_ids)::text
  );
  next_archived_at timestamptz := archived_at;
begin
  delete from public.pt_sessions
  where id = any(target_session_ids);

  update public.notifications
  set archived_at = next_archived_at
  where archived_at is null
    and type in (
      'reschedule_request',
      'reschedule_approved',
      'reschedule_denied',
      'status_change_request',
      'status_change_approved',
      'status_change_denied'
    )
    and metadata->>'sessionId' = any(target_session_id_texts);
end;
$$;

revoke all on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz)
from public, anon, authenticated;

grant execute on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz)
to service_role;
