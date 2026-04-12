alter table public.training_plan_days
  add column if not exists session_time time;

alter table public.training_plan_days
  alter column training_type_name drop not null;

update public.training_plan_days as training_day
set session_time = assignment.session_time
from public.trainer_clients as assignment
where training_day.assignment_id = assignment.id
  and training_day.session_time is null;

insert into public.training_plan_days (
  assignment_id,
  day_of_week,
  session_time,
  training_type_name
)
select
  assignment.id,
  scheduled_day.day_of_week,
  assignment.session_time,
  null
from public.trainer_clients as assignment
cross join unnest(coalesce(assignment.scheduled_days, '{}'::text[])) as scheduled_day(day_of_week)
left join public.training_plan_days as training_day
  on training_day.assignment_id = assignment.id
 and training_day.day_of_week = scheduled_day.day_of_week
where training_day.id is null;

alter table public.training_plan_days
  alter column session_time set not null;

alter table public.trainer_clients
  drop constraint if exists trainer_clients_sessions_per_week_check;

alter table public.trainer_clients
  add constraint trainer_clients_sessions_per_week_check
  check (sessions_per_week between 1 and 7);

comment on column public.training_plan_days.session_time is
  'Per-day Jamaica-local training time stored without timezone, e.g. 07:00:00.';
