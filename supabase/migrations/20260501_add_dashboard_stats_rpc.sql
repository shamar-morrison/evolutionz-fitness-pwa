create or replace function public.get_dashboard_stats(
  p_now timestamptz,
  p_timezone_offset text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
begin
  if p_now is null then
    raise exception 'Current timestamp is required.';
  end if;

  if p_timezone_offset is null or btrim(p_timezone_offset) = '' then
    raise exception 'Timezone offset is required.';
  end if;

  with boundaries as (
    select
      (((p_now at time zone 'America/Jamaica')::date)::text || 'T00:00:00' || p_timezone_offset)::timestamptz as expiring_start,
      ((((p_now at time zone 'America/Jamaica')::date + 8)::text || 'T00:00:00' || p_timezone_offset)::timestamptz) as expiring_end,
      (((date_trunc('month', p_now at time zone 'America/Jamaica'))::date)::text || 'T00:00:00' || p_timezone_offset)::timestamptz as current_month_start,
      ((((date_trunc('month', p_now at time zone 'America/Jamaica') - interval '1 month'))::date)::text || 'T00:00:00' || p_timezone_offset)::timestamptz as previous_month_start,
      ((((date_trunc('month', p_now at time zone 'America/Jamaica') + interval '1 month'))::date)::text || 'T00:00:00' || p_timezone_offset)::timestamptz as next_month_start,
      ((date_trunc('month', p_now at time zone 'America/Jamaica')::date + interval '-5 months')::date) as signup_start_date,
      ((date_trunc('month', p_now at time zone 'America/Jamaica')::date + interval '1 month')::date) as signup_end_exclusive_date,
      (date_trunc('month', p_now at time zone 'America/Jamaica')::date) as signup_current_month
  ),
  months as (
    select
      ((b.signup_start_date + (series.month_offset || ' month')::interval)::date) as month_start
    from boundaries b
    cross join generate_series(0, 5) as series(month_offset)
  ),
  signup_counts as (
    select
      to_char(m.joined_at, 'YYYY-MM') as month,
      count(*)::integer as count
    from public.members m
    cross join boundaries b
    where m.joined_at is not null
      and m.joined_at >= b.signup_start_date
      and m.joined_at < b.signup_end_exclusive_date
    group by 1
  ),
  signups as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'month',
            to_char(months.month_start, 'YYYY-MM'),
            'count',
            coalesce(signup_counts.count, 0)
          )
          order by months.month_start
        ),
        '[]'::jsonb
      ) as signups_by_month,
      coalesce(
        max(
          case
            when months.month_start = b.signup_current_month then coalesce(signup_counts.count, 0)
            else 0
          end
        ),
        0
      )::integer as signed_up_this_month
    from months
    cross join boundaries b
    left join signup_counts on signup_counts.month = to_char(months.month_start, 'YYYY-MM')
  )
  select jsonb_build_object(
    'activeMembers',
    (
      select count(*)::integer
      from public.members
      where status = 'Active'
    ),
    'activeMembersLastMonth',
    (
      select count(*)::integer
      from public.members m
      cross join boundaries b
      where m.begin_time is not null
        and m.begin_time < b.current_month_start
        and (m.end_time is null or m.end_time > b.previous_month_start)
    ),
    'totalExpiredMembers',
    (
      select count(*)::integer
      from public.members
      where status = 'Expired'
    ),
    'expiringSoon',
    (
      select count(*)::integer
      from public.members m
      cross join boundaries b
      where m.status = 'Active'
        and m.end_time >= b.expiring_start
        and m.end_time < b.expiring_end
    ),
    'signedUpThisMonth',
    (select signed_up_this_month from signups),
    'signupsByMonth',
    (select signups_by_month from signups),
    'expiredThisMonth',
    (
      select count(*)::integer
      from public.members m
      cross join boundaries b
      where m.end_time >= b.current_month_start
        and m.end_time < b.next_month_start
    ),
    'expiredThisMonthLastMonth',
    (
      select count(*)::integer
      from public.members m
      cross join boundaries b
      where m.end_time >= b.previous_month_start
        and m.end_time < b.current_month_start
    )
  ) into v_result;

  return v_result;
end;
$$;
