create or replace function public.approve_member_extension_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_review_timestamp timestamptz,
  p_new_end_time text
)
returns uuid
language plpgsql
as $$
declare
  v_request public.member_extension_requests%rowtype;
  v_member public.members%rowtype;
  v_new_end_time timestamptz;
  v_new_status text;
begin
  select *
  into v_request
  from public.member_extension_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Member extension request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  select *
  into v_member
  from public.members
  where id = v_request.member_id
  for update;

  if not found then
    raise exception 'Member not found.';
  end if;

  if p_new_end_time ~ '(?:[zZ]|[+-][0-9]{2}:[0-9]{2})$' then
    v_new_end_time := p_new_end_time::timestamptz;
  else
    v_new_end_time := (p_new_end_time || 'Z')::timestamptz;
  end if;

  if v_member.status = 'Suspended'
     or v_member.end_time is null
     or v_member.end_time < p_review_timestamp then
    raise exception 'Member has no active membership.';
  end if;

  v_new_status := case
    when v_member.status = 'Suspended' then 'Suspended'
    when v_new_end_time < p_review_timestamp then 'Expired'
    else 'Active'
  end;

  update public.members
  set end_time = v_new_end_time,
      status = v_new_status
  where id = v_request.member_id;

  update public.member_extension_requests
  set status = 'approved',
      reviewed_by = p_reviewer_id,
      review_timestamp = p_review_timestamp
  where id = v_request.id;

  return v_request.id;
end;
$$;
