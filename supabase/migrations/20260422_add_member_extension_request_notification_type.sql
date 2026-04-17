alter table public.notifications
drop constraint if exists notifications_type_check;

alter table public.notifications
add constraint notifications_type_check
check (type in (
  'reschedule_request',
  'member_create_request',
  'member_edit_request',
  'member_payment_request',
  'member_extension_request',
  'reschedule_approved',
  'reschedule_denied',
  'client_assigned',
  'status_change_request',
  'status_change_approved',
  'status_change_denied'
));
