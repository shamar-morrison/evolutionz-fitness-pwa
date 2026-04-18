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
