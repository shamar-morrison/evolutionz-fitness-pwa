alter table public.member_edit_requests
  add column proposed_start_date date,
  add column proposed_start_time time,
  add column proposed_duration text;
