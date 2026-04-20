alter table public.class_registrations
add column if not exists fee_type text,
add column if not exists notes text,
add column if not exists receipt_number text,
add column if not exists receipt_sent_at timestamptz;

alter table public.class_registrations
drop constraint if exists class_registrations_fee_type_check;

alter table public.class_registrations
add constraint class_registrations_fee_type_check
check (fee_type in ('monthly', 'per_session', 'custom'));

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
before insert on public.class_registrations
for each row
execute function public.assign_class_registration_receipt_number();

create unique index if not exists class_registrations_receipt_number_unique_idx
  on public.class_registrations (receipt_number)
  where receipt_number is not null;

alter table public.admin_email_deliveries
add column if not exists class_registration_id uuid
  references public.class_registrations(id) on delete cascade;

create unique index if not exists admin_email_deliveries_class_registration_id_unique_idx
  on public.admin_email_deliveries (class_registration_id)
  where class_registration_id is not null;
