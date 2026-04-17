import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PendingMemberExtensionRequestsPage } from '@/components/pending-member-extension-requests-page'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberExtensionRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingMemberExtensionRequestsPage />
    </RoleGuard>
  )
}
