import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PendingMemberEditRequestsPage } from '@/components/pending-member-edit-requests-page'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberEditRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingMemberEditRequestsPage />
    </RoleGuard>
  )
}
