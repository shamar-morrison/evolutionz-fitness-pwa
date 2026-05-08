alter table public.member_types
add column if not exists requires_card boolean not null default true;

comment on column public.member_types.requires_card is
  'Whether members with this type must be assigned a physical access card.';

insert into public.member_types (
  name,
  monthly_rate,
  requires_card
)
values (
  'Day Pass',
  2000,
  false
)
on conflict (name) do update
set monthly_rate = excluded.monthly_rate,
    requires_card = excluded.requires_card;

alter table public.members
alter column employee_no drop not null;

alter table public.member_approval_requests
alter column card_no drop not null;

alter table public.member_approval_requests
alter column card_code drop not null;

alter table public.members
drop constraint if exists members_type_check;

alter table public.members
add constraint members_type_check
check (type in ('General', 'Civil Servant', 'Student/BPO', 'Day Pass'));

create or replace function public.approve_member_payment_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_review_timestamp timestamptz,
  p_membership_begin_time timestamptz,
  p_membership_end_time timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_request public.member_payment_requests%rowtype;
  v_member public.members%rowtype;
  v_final_member_type_id uuid;
  v_next_member_type public.member_types%rowtype;
  v_inserted_payment_id uuid;
begin
  select *
  into v_request
  from public.member_payment_requests
  where id = p_request_id;

  if not found then
    raise exception 'Member payment request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  select *
  into v_member
  from public.members
  where id = v_request.member_id;

  if not found then
    raise exception 'Member not found.';
  end if;

  v_final_member_type_id := coalesce(v_request.member_type_id, v_member.member_type_id);

  if v_request.payment_type = 'membership' and v_final_member_type_id is null then
    raise exception 'Membership type is required to approve this payment request.';
  end if;

  if v_request.payment_type = 'membership'
     and v_request.member_type_id is not null
     and v_request.member_type_id is distinct from v_member.member_type_id then
    select *
    into v_next_member_type
    from public.member_types
    where id = v_request.member_type_id;

    if not found then
      raise exception 'Membership type not found.';
    end if;

    if v_next_member_type.requires_card = false
       and (v_member.card_no is not null or v_member.employee_no is not null) then
      raise exception 'Cannot switch a member with card access to a cardless membership type.';
    end if;

    update public.members
    set member_type_id = v_request.member_type_id,
        type = v_next_member_type.name
    where id = v_request.member_id;
  end if;

  insert into public.member_payments (
    member_id,
    member_type_id,
    payment_type,
    payment_method,
    amount_paid,
    promotion,
    recorded_by,
    payment_date,
    notes,
    membership_begin_time,
    membership_end_time
  )
  values (
    v_request.member_id,
    case
      when v_request.payment_type = 'membership' then v_final_member_type_id
      else null
    end,
    v_request.payment_type,
    v_request.payment_method,
    v_request.amount,
    null,
    v_request.requested_by,
    v_request.payment_date,
    nullif(btrim(v_request.notes), ''),
    p_membership_begin_time,
    p_membership_end_time
  )
  returning id into v_inserted_payment_id;

  update public.member_payment_requests
  set status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = p_review_timestamp
  where id = v_request.id;

  return v_inserted_payment_id;
end;
$$;

create or replace function public.delete_member_payment_and_sync_member_type(
  p_payment_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
as $$
declare
  v_deleted_payment_type text;
  v_member public.members%rowtype;
  v_latest_member_type_id uuid;
  v_latest_member_type public.member_types%rowtype;
begin
  delete from public.member_payments
  where id = p_payment_id
    and member_id = p_member_id
  returning payment_type into v_deleted_payment_type;

  if not found then
    raise exception 'Member payment % was not found for member %.', p_payment_id, p_member_id;
  end if;

  if v_deleted_payment_type <> 'membership' then
    return;
  end if;

  select *
  into v_member
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'Member % was not found.', p_member_id;
  end if;

  select mp.member_type_id
  into v_latest_member_type_id
  from public.member_payments mp
  where mp.member_id = p_member_id
    and mp.payment_type = 'membership'
  order by mp.payment_date desc, mp.created_at desc, mp.id desc
  limit 1;

  if v_latest_member_type_id is not null then
    select *
    into v_latest_member_type
    from public.member_types
    where id = v_latest_member_type_id;

    if not found then
      raise exception 'Membership type not found.';
    end if;

    if v_latest_member_type.requires_card = false
       and (v_member.card_no is not null or v_member.employee_no is not null) then
      raise exception 'Cannot switch a member with card access to a cardless membership type.';
    end if;
  end if;

  update public.members
  set member_type_id = v_latest_member_type_id,
      type = coalesce(v_latest_member_type.name, 'General')
  where id = p_member_id;

  if not found then
    raise exception 'Member % was not found.', p_member_id;
  end if;
end;
$$;

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
      cards.status as card_status,
      coalesce(member_types.requires_card, true) as requires_card
    from public.member_pauses as pauses
    join public.members
      on public.members.id = pauses.member_id
    left join public.member_types
      on public.member_types.id = public.members.member_type_id
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

      if v_pause.requires_card
         and v_pause.employee_no is not null
         and v_pause.card_no is not null
         and v_pause.card_status = 'assigned' then
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
