create or replace function public.delete_member_payment_and_sync_member_type(
  p_payment_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
as $$
declare
  v_latest_member_type_id uuid;
  v_latest_member_type_name text;
begin
  delete from public.member_payments
  where id = p_payment_id
    and member_id = p_member_id;

  if not found then
    raise exception 'Member payment % was not found for member %.', p_payment_id, p_member_id;
  end if;

  select mp.member_type_id, mt.name
  into v_latest_member_type_id, v_latest_member_type_name
  from public.member_payments mp
  join public.member_types mt on mt.id = mp.member_type_id
  where mp.member_id = p_member_id
  order by mp.payment_date desc, mp.created_at desc, mp.id desc
  limit 1;

  update public.members
  set member_type_id = v_latest_member_type_id,
      type = coalesce(v_latest_member_type_name, 'General')
  where id = p_member_id;

  if not found then
    raise exception 'Member % was not found.', p_member_id;
  end if;
end;
$$;
