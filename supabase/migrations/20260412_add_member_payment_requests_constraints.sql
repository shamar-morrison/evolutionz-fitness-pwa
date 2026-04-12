alter table public.member_payment_requests
drop constraint if exists member_payment_requests_amount_positive;

alter table public.member_payment_requests
add constraint member_payment_requests_amount_positive
check (amount > 0);
