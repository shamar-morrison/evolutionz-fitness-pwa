create or replace function public.approve_member_pause_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_review_timestamp timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_request public.member_pause_requests%rowtype;
begin
  select *
  into v_request
  from public.member_pause_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Member pause request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  if v_request.duration_days not in (7, 14, 28, 56, 84, 112, 140, 168, 252, 336) then
    raise exception 'Duration must match a supported membership option.';
  end if;

  perform public.apply_member_pause(
    v_request.member_id,
    v_request.duration_days,
    p_reviewer_id,
    p_review_timestamp
  );

  update public.member_pause_requests
  set status = 'approved',
      reviewed_by = p_reviewer_id,
      review_timestamp = p_review_timestamp
  where id = v_request.id;

  return v_request.id;
end;
$$;
