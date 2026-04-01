create or replace function public.assign_member_card(
  p_member_id uuid,
  p_employee_no text,
  p_card_no text
)
returns void
language plpgsql
as $$
begin
  update public.cards
  set status = 'assigned',
      employee_no = p_employee_no,
      updated_at = now()
  where card_no = p_card_no
    and status = 'available';

  if not found then
    raise exception 'Card % is not available for assignment.', p_card_no;
  end if;

  update public.members
  set card_no = p_card_no,
      updated_at = now()
  where id = p_member_id
    and employee_no = p_employee_no
    and card_no is null;

  if not found then
    raise exception 'Member % is not eligible to receive card %.', p_member_id, p_card_no;
  end if;
end;
$$;
