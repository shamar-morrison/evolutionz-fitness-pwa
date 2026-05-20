ALTER TABLE public.trainer_clients
  ADD COLUMN IF NOT EXISTS commission_override integer;

-- Redefine public.update_pt_assignment_with_schedule function
CREATE OR REPLACE FUNCTION public.update_pt_assignment_with_schedule(
  p_assignment_id uuid,
  p_sessions_per_week integer,
  p_scheduled_days text[],
  p_schedule jsonb,
  p_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  next_updates jsonb := coalesce(p_updates, '{}'::jsonb);
  next_notes text := case
    when next_updates ? 'notes' then nullif(btrim(next_updates->>'notes'), '')
    else null
  end;
BEGIN
  update public.trainer_clients
  set status = case
        when next_updates ? 'status' then next_updates->>'status'
        else status
      end,
      pt_fee = case
        when next_updates ? 'ptFee' then (next_updates->>'ptFee')::integer
        else pt_fee
      end,
      commission_override = case
        when next_updates ? 'commissionOverride' then
          case
            when next_updates->'commissionOverride' = 'null'::jsonb or next_updates->>'commissionOverride' is null then null
            else (next_updates->>'commissionOverride')::integer
          end
        else commission_override
      end,
      notes = case
        when next_updates ? 'notes' then next_notes
        else notes
      end,
      sessions_per_week = p_sessions_per_week,
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
END;
$$;

revoke all on function public.update_pt_assignment_with_schedule(uuid, integer, text[], jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.update_pt_assignment_with_schedule(uuid, integer, text[], jsonb, jsonb)
to service_role;
