create or replace function public.apply_member_pause(
  p_member_id uuid,
  p_duration_days integer,
  p_applied_by uuid,
  p_now timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_member public.members%rowtype;
  v_pause_id uuid;
  v_pause_start_date date;
begin
  if p_duration_days is null then
    raise exception 'Pause duration is required.';
  end if;

  if p_now is null then
    raise exception 'Current timestamp is required.';
  end if;

  if p_duration_days < 7 or p_duration_days > 364 then
    raise exception 'Duration must be between 7 and 364 days.';
  end if;

  select *
  into v_member
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found.';
  end if;

  if v_member.status <> 'Active'
     or v_member.end_time is null
     or v_member.end_time < p_now then
    raise exception 'Member has no active membership.';
  end if;

  if exists (
    select 1
    from public.member_pauses
    where member_id = p_member_id
      and status = 'active'
  ) then
    raise exception 'Member already has an active pause.';
  end if;

  v_pause_start_date := (p_now at time zone 'America/Jamaica')::date;

  update public.members
  set status = 'Paused'
  where id = p_member_id;

  insert into public.member_pauses (
    member_id,
    original_end_time,
    pause_start_date,
    planned_resume_date,
    applied_by
  )
  values (
    p_member_id,
    v_member.end_time,
    v_pause_start_date,
    v_pause_start_date + p_duration_days,
    p_applied_by
  )
  returning id into v_pause_id;

  return v_pause_id;
end;
$$;

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
  if p_actual_resume_date is null then
    raise exception 'Resume date is required.';
  end if;

  if p_now is null then
    raise exception 'Current timestamp is required.';
  end if;

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

  if p_actual_resume_date > p_now::date then
    raise exception 'Resume date cannot be in the future.';
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
