alter table public.membership_expiry_email_sends
drop constraint if exists membership_expiry_email_sends_status_check;

update public.membership_expiry_email_sends
set status = 'sent'
where sent_at is not null
  and status is distinct from 'sent';

update public.membership_expiry_email_sends
set status = 'pending'
where sent_at is null
  and status is distinct from 'pending';

alter table public.membership_expiry_email_sends
alter column status set default 'pending';

alter table public.membership_expiry_email_sends
alter column status set not null;

alter table public.membership_expiry_email_sends
add constraint membership_expiry_email_sends_status_check
check (status in ('pending', 'sent'));

alter table public.membership_expiry_email_sends
alter column sent_at drop not null;

alter table public.membership_expiry_email_sends
alter column sent_at drop default;
