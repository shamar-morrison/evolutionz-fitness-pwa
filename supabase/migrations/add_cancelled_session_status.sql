alter table public.pt_sessions
drop constraint if exists pt_sessions_status_check;

alter table public.pt_sessions
add constraint pt_sessions_status_check
check (status in ('scheduled', 'completed', 'missed', 'rescheduled', 'cancelled'));
