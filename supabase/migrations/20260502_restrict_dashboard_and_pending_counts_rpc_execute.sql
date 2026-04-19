revoke all on function public.get_dashboard_stats(timestamptz, text)
from public, anon, authenticated;

grant execute on function public.get_dashboard_stats(timestamptz, text)
to service_role;

revoke all on function public.get_pending_approval_counts()
from public, anon, authenticated;

grant execute on function public.get_pending_approval_counts()
to service_role;
