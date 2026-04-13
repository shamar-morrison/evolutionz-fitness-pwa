alter table public.member_payments
add column if not exists payment_type text;

alter table public.member_payment_requests
add column if not exists payment_type text;

update public.member_payments
set payment_type = 'membership'
where payment_type is null;

update public.member_payment_requests
set payment_type = 'membership'
where payment_type is null;

alter table public.member_payments
alter column payment_type set not null;

alter table public.member_payment_requests
alter column payment_type set not null;

alter table public.member_payments
alter column member_type_id drop not null;

alter table public.member_payments
drop constraint if exists member_payments_payment_type_check;

alter table public.member_payments
add constraint member_payments_payment_type_check
check (payment_type in ('membership', 'card_fee'));

alter table public.member_payment_requests
drop constraint if exists member_payment_requests_payment_type_check;

alter table public.member_payment_requests
add constraint member_payment_requests_payment_type_check
check (payment_type in ('membership', 'card_fee'));

alter table public.member_payments
drop constraint if exists member_payments_membership_type_requirement_check;

alter table public.member_payments
add constraint member_payments_membership_type_requirement_check
check (
  (payment_type = 'membership' and member_type_id is not null)
  or (payment_type = 'card_fee' and member_type_id is null)
);

alter table public.member_payment_requests
drop constraint if exists member_payment_requests_membership_type_requirement_check;

alter table public.member_payment_requests
add constraint member_payment_requests_membership_type_requirement_check
check (
  (payment_type = 'membership' and member_type_id is not null)
  or (payment_type = 'card_fee' and member_type_id is null)
);

create or replace function public.delete_member_payment_and_sync_member_type(
  p_payment_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
as $$
declare
  v_deleted_payment_type text;
  v_latest_member_type_id uuid;
  v_latest_member_type_name text;
begin
  delete from public.member_payments
  where id = p_payment_id
    and member_id = p_member_id
  returning payment_type into v_deleted_payment_type;

  if not found then
    raise exception 'Member payment % was not found for member %.', p_payment_id, p_member_id;
  end if;

  if v_deleted_payment_type <> 'membership' then
    return;
  end if;

  select mp.member_type_id, mt.name
  into v_latest_member_type_id, v_latest_member_type_name
  from public.member_payments mp
  join public.member_types mt on mt.id = mp.member_type_id
  where mp.member_id = p_member_id
    and mp.payment_type = 'membership'
  order by mp.payment_date desc, mp.created_at desc, mp.id desc
  limit 1;

  update public.members
  set member_type_id = v_latest_member_type_id,
      type = coalesce(v_latest_member_type_name, 'General')
  where id = p_member_id;

  if not found then
    raise exception 'Member % was not found.', p_member_id;
  end if;
end;
$$;
