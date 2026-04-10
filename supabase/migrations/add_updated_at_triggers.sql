create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Automatically sets updated_at to now() on every UPDATE. Applied via trigger to all tables with an updated_at column.';

drop trigger if exists set_updated_at on public.members;

create trigger set_updated_at
before update on public.members
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.cards;

create trigger set_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.trainer_clients;

create trigger set_updated_at
before update on public.trainer_clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pt_sessions;

create trigger set_updated_at
before update on public.pt_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pt_reschedule_requests;

create trigger set_updated_at
before update on public.pt_reschedule_requests
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pt_session_update_requests;

create trigger set_updated_at
before update on public.pt_session_update_requests
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.training_plan_days;

create trigger set_updated_at
before update on public.training_plan_days
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.member_approval_requests;

create trigger set_updated_at
before update on public.member_approval_requests
for each row
execute function public.set_updated_at();
