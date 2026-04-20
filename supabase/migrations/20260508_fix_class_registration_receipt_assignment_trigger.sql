create or replace function public.assign_class_registration_receipt_number()
returns trigger
language plpgsql
as $$
declare
  v_sequence_number bigint;
  v_receipt_year text;
begin
  if new.receipt_number is not null then
    return new;
  end if;

  if new.payment_recorded_at is null or coalesce(new.amount_paid, 0) <= 0 then
    return new;
  end if;

  if tg_op = 'UPDATE' and (old.payment_recorded_at is not null or coalesce(old.amount_paid, 0) > 0) then
    return new;
  end if;

  v_sequence_number := nextval('public.member_payment_receipt_number_seq');
  v_receipt_year := to_char(
    coalesce(new.payment_recorded_at, new.created_at, now()) at time zone 'America/Jamaica',
    'YYYY'
  );
  new.receipt_number := 'EF-' || v_receipt_year || '-' || lpad(v_sequence_number::text, 5, '0');

  return new;
end;
$$;

drop trigger if exists assign_class_registration_receipt_number_before_insert
on public.class_registrations;

create trigger assign_class_registration_receipt_number_before_insert
before insert or update on public.class_registrations
for each row
execute function public.assign_class_registration_receipt_number();
