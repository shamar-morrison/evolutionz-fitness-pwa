create index member_edit_requests_status_created_at_idx
  on public.member_edit_requests (status, created_at desc);

create index member_edit_requests_member_id_created_at_idx
  on public.member_edit_requests (member_id, created_at desc);

create index member_edit_requests_requested_by_idx
  on public.member_edit_requests (requested_by);

create index member_payment_requests_status_created_at_idx
  on public.member_payment_requests (status, created_at desc);

create index member_payment_requests_member_id_created_at_idx
  on public.member_payment_requests (member_id, created_at desc);

create index member_payment_requests_requested_by_idx
  on public.member_payment_requests (requested_by);
