create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  name text not null,
  card_no text,
  type text not null default 'General',
  status text not null default 'Active',
  expiry timestamptz,
  balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_type_check check (type in ('General', 'Civil Servant', 'Student/BPO')),
  constraint members_status_check check (status in ('Active', 'Expired', 'Suspended'))
);

-- TODO: enable RLS policies before production

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  card_no text not null unique,
  employee_no text,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_status_check check (status in ('available', 'assigned'))
);

-- TODO: enable RLS policies before production
