update public.profiles
set titles = coalesce(
  (
    select array_agg(mapped_title order by first_position)
    from (
      select
        min(title_value.ordinality) as first_position,
        case
          when title_value.title = 'Medical' then 'Medical/Consultant'
          else title_value.title
        end as mapped_title
      from unnest(titles) with ordinality as title_value(title, ordinality)
      group by
        case
          when title_value.title = 'Medical' then 'Medical/Consultant'
          else title_value.title
        end
    ) as deduped_titles
  ),
  '{}'::text[]
)
where 'Medical' = any(titles);

create table public.medical_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  follow_up_date date,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medical_visit_notes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.medical_assignments(id) on delete cascade,
  visit_date date not null,
  notes text,
  follow_up_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index medical_assignments_member_staff_active_idx
  on public.medical_assignments (member_id, staff_id)
  where status = 'active';

create index medical_assignments_member_status_idx
  on public.medical_assignments (member_id, status);

create index medical_assignments_staff_status_idx
  on public.medical_assignments (staff_id, status);

create index medical_visit_notes_assignment_visit_date_idx
  on public.medical_visit_notes (assignment_id, visit_date desc, created_at desc);

alter table public.medical_assignments enable row level security;
alter table public.medical_visit_notes enable row level security;

create policy "Admins full access to medical_assignments"
on public.medical_assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Medical staff can read own assignments"
on public.medical_assignments
for select
to authenticated
using (staff_id = auth.uid());

create policy "Medical staff can update own assignments"
on public.medical_assignments
for update
to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid());

create policy "Admins full access to medical_visit_notes"
on public.medical_visit_notes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Medical staff can read own visit notes"
on public.medical_visit_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.medical_assignments
    where public.medical_assignments.id = medical_visit_notes.assignment_id
      and public.medical_assignments.staff_id = auth.uid()
  )
);

create policy "Medical staff can insert own visit notes"
on public.medical_visit_notes
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.medical_assignments
    where public.medical_assignments.id = medical_visit_notes.assignment_id
      and public.medical_assignments.staff_id = auth.uid()
  )
);

drop trigger if exists set_updated_at on public.medical_assignments;

create trigger set_updated_at
before update on public.medical_assignments
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.medical_visit_notes;

create trigger set_updated_at
before update on public.medical_visit_notes
for each row
execute function public.set_updated_at();
