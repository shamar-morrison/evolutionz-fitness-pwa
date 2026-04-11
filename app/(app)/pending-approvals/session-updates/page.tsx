import { PendingApprovalsPageContent } from '@/components/pending-approvals-page-content'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'

export default function PendingSessionUpdatesPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingApprovalsPageContent view="session-updates" />
    </RoleGuard>
  )
}
