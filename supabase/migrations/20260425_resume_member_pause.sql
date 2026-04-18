create or replace function public.resume_member_pause(
  p_pause_id uuid,
  p_actual_resume_date date,
  p_now timestamptz
)
returns timestamptz
language plpgsql
as $$
declare
  v_pause public.member_pauses%rowtype;
  v_member public.members%rowtype;
  v_actual_days_paused integer;
  v_new_end_time timestamptz;
begin
  select *
  into v_pause
  from public.member_pauses
  where id = p_pause_id
  for update;

  if not found then
    raise exception 'Member pause not found.';
  end if;

  if v_pause.status <> 'active' then
    raise exception 'This pause is no longer active.';
  end if;

  if p_actual_resume_date < v_pause.pause_start_date then
    raise exception 'Resume date cannot be before the pause start date.';
  end if;

  select *
  into v_member
  from public.members
  where id = v_pause.member_id
  for update;

  if not found then
    raise exception 'Member not found.';
  end if;

  v_actual_days_paused := p_actual_resume_date - v_pause.pause_start_date;
  v_new_end_time := v_pause.original_end_time + ((v_actual_days_paused || ' days')::interval);

  update public.members
  set end_time = v_new_end_time,
      status = 'Active'
  where id = v_pause.member_id;

  update public.member_pauses
  set status = 'resumed',
      actual_resume_date = p_actual_resume_date
  where id = v_pause.id;

  return v_new_end_time;
end;
$$;
