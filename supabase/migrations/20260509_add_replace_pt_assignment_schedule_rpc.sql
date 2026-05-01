create or replace function public.replace_pt_assignment_schedule(
  p_assignment_id uuid,
  p_sessions_per_week integer,
  p_scheduled_days text[],
  p_schedule jsonb
)
returns uuid
language plpgsql
as $$
begin
  update public.trainer_clients
  set sessions_per_week = p_sessions_per_week,
      scheduled_days = coalesce(p_scheduled_days, '{}'::text[]),
      updated_at = now()
  where id = p_assignment_id;

  if not found then
    raise exception 'PT assignment not found.';
  end if;

  delete from public.training_plan_days
  where assignment_id = p_assignment_id;

  insert into public.training_plan_days (
    assignment_id,
    day_of_week,
    session_time,
    training_type_name
  )
  select
    p_assignment_id,
    schedule_day.day_of_week,
    schedule_day.session_time,
    schedule_day.training_type_name
  from jsonb_to_recordset(coalesce(p_schedule, '[]'::jsonb)) as schedule_day(
    day_of_week text,
    session_time time,
    training_type_name text
  );

  return p_assignment_id;
end;
$$;

revoke all on function public.replace_pt_assignment_schedule(uuid, integer, text[], jsonb)
from public, anon, authenticated;

grant execute on function public.replace_pt_assignment_schedule(uuid, integer, text[], jsonb)
to service_role;
