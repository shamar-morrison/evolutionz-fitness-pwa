alter table public.member_payments
add column if not exists receipt_sent_at timestamptz;

alter table public.admin_email_deliveries
add column if not exists payment_id uuid references public.member_payments(id) on delete cascade;

create unique index if not exists admin_email_deliveries_payment_id_unique_idx
  on public.admin_email_deliveries (payment_id)
  where payment_id is not null;
