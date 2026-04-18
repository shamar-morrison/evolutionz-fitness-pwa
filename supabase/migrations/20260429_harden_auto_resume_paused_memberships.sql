create or replace function public.auto_resume_expired_pauses(
  p_today date
)
returns void
language plpgsql
as $$
declare
  v_pause record;
  v_resumed_end_time timestamptz;
  v_error_message text;
  v_error_detail text;
  v_error_hint text;
  v_error_state text;
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
    begin
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
    exception
      when others then
        get stacked diagnostics
          v_error_message = message_text,
          v_error_detail = pg_exception_detail,
          v_error_hint = pg_exception_hint,
          v_error_state = returned_sqlstate;

        raise log 'Failed to auto-resume pause %, member %: sqlstate=%, message=%, detail=%, hint=%',
          v_pause.id,
          v_pause.member_id,
          v_error_state,
          v_error_message,
          coalesce(v_error_detail, ''),
          coalesce(v_error_hint, '');

        continue;
    end;
  end loop;
end;
$$;
