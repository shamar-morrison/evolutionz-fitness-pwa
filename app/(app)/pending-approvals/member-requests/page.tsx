import { PendingMemberRequestsPage } from '@/components/pending-member-requests-page'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingMemberRequestsPage />
    </RoleGuard>
  )
}
