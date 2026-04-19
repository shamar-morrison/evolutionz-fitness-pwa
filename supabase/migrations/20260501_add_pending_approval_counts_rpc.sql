create or replace function public.get_pending_approval_counts()
returns table (
  member_approval_requests integer,
  member_edit_requests integer,
  member_payment_requests integer,
  member_extension_requests integer,
  member_pause_requests integer,
  member_pause_resume_requests integer,
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
    (select count(*)::integer from public.pt_reschedule_requests where status = 'pending') as pt_reschedule_requests,
    (select count(*)::integer from public.pt_session_update_requests where status = 'pending') as pt_session_update_requests;
$$;
