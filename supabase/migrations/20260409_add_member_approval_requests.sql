create table if not exists public.member_approval_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text,
  email text,
  phone text,
  remark text,
  begin_time timestamptz not null,
  end_time timestamptz not null,
  card_no text not null,
  card_code text not null,
  member_type_id uuid not null references public.member_types(id) on delete restrict,
  photo_url text,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_approval_requests_gender_check check (gender in ('Male', 'Female')),
  constraint member_approval_requests_status_check check (status in ('pending', 'approved', 'denied'))
);

create index if not exists member_approval_requests_status_idx
on public.member_approval_requests (status, created_at desc);
