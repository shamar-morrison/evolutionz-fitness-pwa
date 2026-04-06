-- Training type options (predefined)
create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed predefined types
insert into public.training_types (name, is_custom) values
  ('Cardio', false),
  ('Strength', false),
  ('Lower Body', false),
  ('Upper Body', false),
  ('Legs', false),
  ('Chest', false),
  ('Back', false),
  ('Shoulders', false),
  ('Arms', false),
  ('Core', false),
  ('HIIT', false),
  ('Flexibility & Mobility', false),
  ('Recovery', false),
  ('Full Body', false)
on conflict (name) do nothing;

-- Training plan: one row per scheduled day per assignment
create table if not exists public.training_plan_days (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.trainer_clients(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  training_type_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, day_of_week)
);

create index if not exists training_plan_days_assignment_idx
  on public.training_plan_days (assignment_id);

-- RLS
alter table public.training_types enable row level security;
alter table public.training_plan_days enable row level security;

create policy "authenticated users can read training_types"
  on public.training_types for select to authenticated using (true);
create policy "admins can insert training_types"
  on public.training_types for insert to authenticated with check (public.is_admin());
create policy "admins can update training_types"
  on public.training_types for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can delete training_types"
  on public.training_types for delete to authenticated using (public.is_admin());

create policy "authenticated users can read training_plan_days"
  on public.training_plan_days for select to authenticated using (true);
create policy "admins can insert training_plan_days"
  on public.training_plan_days for insert to authenticated with check (public.is_admin());
create policy "admins can update training_plan_days"
  on public.training_plan_days for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can delete training_plan_days"
  on public.training_plan_days for delete to authenticated using (public.is_admin());
