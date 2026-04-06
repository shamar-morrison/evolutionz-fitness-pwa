import { PendingApprovalsPageContent } from '@/components/pending-approvals-page-content'
import { RedirectOnMount } from '@/components/redirect-on-mount'
import { RoleGuard } from '@/components/role-guard'

export default function PendingSessionUpdatesPage() {
  return (
    <RoleGuard role="admin" fallback={<RedirectOnMount href="/trainer/schedule" />}>
      <PendingApprovalsPageContent view="session-updates" />
    </RoleGuard>
  )
}
