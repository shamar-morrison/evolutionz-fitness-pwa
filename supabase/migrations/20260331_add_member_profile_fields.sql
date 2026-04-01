alter table public.members
rename column expiry to end_time;

alter table public.members
add column gender text,
add column email text,
add column phone text,
add column remark text,
add column photo_url text,
add column begin_time timestamptz;

alter table public.members
add constraint members_gender_check check (gender in ('Male', 'Female'));
