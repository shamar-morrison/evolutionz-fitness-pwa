alter table public.member_extension_requests
  add constraint member_extension_requests_duration_days_check
  check (duration_days > 0);

create index member_extension_requests_status_created_at_idx
  on public.member_extension_requests (status, created_at desc);

create index member_extension_requests_member_id_created_at_idx
  on public.member_extension_requests (member_id, created_at desc);

create index member_extension_requests_requested_by_idx
  on public.member_extension_requests (requested_by);
