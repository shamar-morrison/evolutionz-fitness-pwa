do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%title%'
  loop
    execute format(
      'alter table public.profiles drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.profiles
rename column title to titles;

alter table public.profiles
alter column titles type text[] using
  case when titles is null then '{}'::text[]
  else array[titles]
  end;

alter table public.profiles
alter column titles set default '{}'::text[];

alter table public.profiles
alter column titles set not null;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and 'Owner' = any(titles)
  );
$$ language sql security definer;
