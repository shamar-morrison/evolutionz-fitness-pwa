update public.class_registration_edit_requests
set proposed_fee_type = 'custom'
where proposed_fee_type is null;

alter table public.class_registration_edit_requests
alter column proposed_fee_type set not null;

alter table public.class_registration_removal_requests
drop constraint if exists class_registration_removal_requests_amount_paid_at_request_check;

alter table public.class_registration_removal_requests
add constraint class_registration_removal_requests_amount_paid_at_request_check
check (amount_paid_at_request >= 0);

create unique index if not exists class_registration_removal_requests_pending_registration_id_unique_idx
  on public.class_registration_removal_requests (registration_id)
  where status = 'pending';
