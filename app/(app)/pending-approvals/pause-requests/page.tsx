import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PendingMemberPauseRequestsPage } from '@/components/pending-member-pause-requests-page'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberPauseRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingMemberPauseRequestsPage />
    </RoleGuard>
  )
}
