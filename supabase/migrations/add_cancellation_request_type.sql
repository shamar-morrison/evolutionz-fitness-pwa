alter table public.pt_session_update_requests
drop constraint if exists pt_session_update_requests_requested_status_check;

alter table public.pt_session_update_requests
add constraint pt_session_update_requests_requested_status_check
check (requested_status in ('completed', 'missed', 'cancelled'));

alter table public.notifications
drop constraint if exists notifications_type_check;

alter table public.notifications
add constraint notifications_type_check
check (type in (
  'reschedule_request',
  'reschedule_approved',
  'reschedule_denied',
  'client_assigned',
  'status_change_request',
  'status_change_approved',
  'status_change_denied'
));
