alter table public.member_payments
add column if not exists receipt_number text,
add column if not exists membership_begin_time timestamptz,
add column if not exists membership_end_time timestamptz;

create sequence if not exists public.member_payment_receipt_number_seq;

create or replace function public.assign_member_payment_receipt_number()
returns trigger
language plpgsql
as $$
declare
  v_sequence_number bigint;
  v_payment_year text;
begin
  if new.receipt_number is not null then
    return new;
  end if;

  v_sequence_number := nextval('public.member_payment_receipt_number_seq');
  v_payment_year := to_char(new.payment_date, 'YYYY');
  new.receipt_number := 'EF-' || v_payment_year || '-' || lpad(v_sequence_number::text, 5, '0');

  return new;
end;
$$;

drop trigger if exists assign_member_payment_receipt_number_before_insert on public.member_payments;

create trigger assign_member_payment_receipt_number_before_insert
before insert on public.member_payments
for each row
execute function public.assign_member_payment_receipt_number();

create unique index if not exists member_payments_receipt_number_unique_idx
  on public.member_payments (receipt_number)
  where receipt_number is not null;
