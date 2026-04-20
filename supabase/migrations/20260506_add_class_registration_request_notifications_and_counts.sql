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
  'member_pause_request',
  'class_registration_edit_request',
  'class_registration_removal_request',
  'reschedule_approved',
  'reschedule_denied',
  'client_assigned',
  'status_change_request',
  'status_change_approved',
  'status_change_denied'
));

drop function if exists public.get_pending_approval_counts();

create function public.get_pending_approval_counts()
returns table (
  member_approval_requests integer,
  member_edit_requests integer,
  member_payment_requests integer,
  member_extension_requests integer,
  member_pause_requests integer,
  member_pause_resume_requests integer,
  class_registration_edit_requests integer,
  class_registration_removal_requests integer,
  pt_reschedule_requests integer,
  pt_session_update_requests integer
)
language sql
stable
as $$
  select
    (select count(*)::integer from public.member_approval_requests where status = 'pending') as member_approval_requests,
    (select count(*)::integer from public.member_edit_requests where status = 'pending') as member_edit_requests,
    (select count(*)::integer from public.member_payment_requests where status = 'pending') as member_payment_requests,
    (select count(*)::integer from public.member_extension_requests where status = 'pending') as member_extension_requests,
    (select count(*)::integer from public.member_pause_requests where status = 'pending') as member_pause_requests,
    (select count(*)::integer from public.member_pause_resume_requests where status = 'pending') as member_pause_resume_requests,
    (select count(*)::integer from public.class_registration_edit_requests where status = 'pending') as class_registration_edit_requests,
    (select count(*)::integer from public.class_registration_removal_requests where status = 'pending') as class_registration_removal_requests,
    (select count(*)::integer from public.pt_reschedule_requests where status = 'pending') as pt_reschedule_requests,
    (select count(*)::integer from public.pt_session_update_requests where status = 'pending') as pt_session_update_requests;
$$;

revoke all on function public.get_pending_approval_counts()
from public, anon, authenticated;

grant execute on function public.get_pending_approval_counts()
to service_role;
