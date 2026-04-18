with ranked_pending_requests as (
  select
    id,
    row_number() over (
      partition by member_id
      order by created_at asc, id asc
    ) as pending_rank
  from public.member_pause_requests
  where status = 'pending'
)
update public.member_pause_requests as requests
set status = 'rejected',
    reviewed_by = null,
    review_timestamp = now()
from ranked_pending_requests
where ranked_pending_requests.id = requests.id
  and ranked_pending_requests.pending_rank > 1;

create unique index member_pause_requests_pending_member_idx
  on public.member_pause_requests (member_id)
  where status = 'pending';
