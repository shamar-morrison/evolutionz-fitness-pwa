alter table public.cards
drop constraint if exists cards_status_check;

alter table public.cards
add constraint cards_status_check
check (status in ('available', 'assigned', 'suspended_lost', 'disabled', 'decommissioned'));

drop function if exists public.unassign_member_card(uuid, text, text);

create or replace function public.unassign_member_card(
  p_member_id uuid,
  p_employee_no text,
  p_card_no text,
  p_decommission boolean default false
)
returns void
language plpgsql
as $$
begin
  update public.cards
  set status = case
        when coalesce(p_decommission, false) then 'decommissioned'
        else 'available'
      end,
      employee_no = null,
      updated_at = now()
  where card_no = p_card_no
    and employee_no = p_employee_no;

  if not found then
    raise exception 'Card % is not assigned to employee %.', p_card_no, p_employee_no;
  end if;

  update public.members
  set status = 'Suspended',
      card_no = null,
      updated_at = now()
  where id = p_member_id
    and employee_no = p_employee_no
    and card_no = p_card_no;

  if not found then
    raise exception 'Member % does not have card % assigned.', p_member_id, p_card_no;
  end if;
end;
$$;
