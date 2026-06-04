create or replace function public.create_medical_visit_note(
  p_assignment_id uuid,
  p_visit_date date,
  p_notes text,
  p_follow_up_date date,
  p_created_by uuid
)
returns public.medical_visit_notes
language plpgsql
as $$
declare
  v_inserted_note public.medical_visit_notes;
begin
  insert into public.medical_visit_notes (
    assignment_id,
    visit_date,
    notes,
    follow_up_date,
    created_by
  )
  values (
    p_assignment_id,
    p_visit_date,
    p_notes,
    p_follow_up_date,
    p_created_by
  )
  returning * into v_inserted_note;

  if p_follow_up_date is not null then
    update public.medical_assignments
    set follow_up_date = p_follow_up_date
    where id = p_assignment_id;
  end if;

  return v_inserted_note;
end;
$$;

revoke all on function public.create_medical_visit_note(uuid, date, text, date, uuid)
from public, anon, authenticated;

grant execute on function public.create_medical_visit_note(uuid, date, text, date, uuid)
to service_role;