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
  v_next_member_type_name text;
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
    select name
    into v_next_member_type_name
    from public.member_types
    where id = v_request.member_type_id;

    if not found then
      raise exception 'Membership type not found.';
    end if;

    update public.members
    set member_type_id = v_request.member_type_id,
        type = v_next_member_type_name
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
