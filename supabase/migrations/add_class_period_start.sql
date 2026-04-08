alter table public.classes
add column if not exists current_period_start date;

comment on column public.classes.current_period_start is
  'Start date of the current 28-day billing period for this class. Set by admin when a new period begins. Null means no active period.';
