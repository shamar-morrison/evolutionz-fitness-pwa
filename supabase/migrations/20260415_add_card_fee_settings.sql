create table if not exists public.card_fee_settings (
  id integer primary key,
  amount_jmd integer not null default 2500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_fee_settings_singleton_check check (id = 1),
  constraint card_fee_settings_amount_jmd_check check (amount_jmd > 0)
);

alter table public.card_fee_settings
enable row level security;

create policy "Admin full access to card_fee_settings"
  on public.card_fee_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.card_fee_settings (id)
values (1)
on conflict (id) do nothing;

create trigger set_updated_at_card_fee_settings
  before update on public.card_fee_settings
  for each row execute function public.set_updated_at();
