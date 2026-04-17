alter table public.member_approval_requests
add column if not exists joined_at date;
