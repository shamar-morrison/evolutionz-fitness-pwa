create or replace function public.auto_resume_expired_pauses(
  p_today date
)
returns void
language plpgsql
as $$
declare
  v_pause record;
  v_resumed_end_time timestamptz;
begin
  for v_pause in
    select
      pauses.id,
      pauses.member_id,
      members.employee_no,
      members.card_no,
      cards.status as card_status
    from public.member_pauses as pauses
    join public.members
      on public.members.id = pauses.member_id
    left join public.cards
      on public.cards.card_no = public.members.card_no
     and public.cards.employee_no = public.members.employee_no
    where pauses.status = 'active'
      and pauses.planned_resume_date <= p_today
  loop
    v_resumed_end_time := public.resume_member_pause(
      v_pause.id,
      p_today,
      ((p_today::text || 'T00:00:00-05:00')::timestamptz)
    );

    if v_pause.card_no is not null and v_pause.card_status = 'assigned' then
      insert into public.access_control_jobs (type, payload)
      values (
        'add_card',
        jsonb_build_object(
          'employeeNo',
          v_pause.employee_no,
          'cardNo',
          v_pause.card_no
        )
      );
    end if;

    raise log 'Auto-resumed paused membership for member %, new_end_time=%',
      v_pause.member_id,
      v_resumed_end_time;
  end loop;
end;
$$;

select cron.schedule(
  'auto-resume-paused-memberships',
  '0 5 * * *',
  $$select public.auto_resume_expired_pauses(current_date);$$
);

-- rollback
-- select cron.unschedule('auto-resume-paused-memberships');
