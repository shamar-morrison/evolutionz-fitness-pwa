import { PendingApprovalsPageContent } from '@/components/pending-approvals-page-content'
import { RedirectOnMount } from '@/components/redirect-on-mount'
import { RoleGuard } from '@/components/role-guard'

export default function PendingRescheduleRequestsPage() {
  return (
    <RoleGuard role="admin" fallback={<RedirectOnMount href="/trainer/schedule" />}>
      <PendingApprovalsPageContent view="reschedule-requests" />
    </RoleGuard>
  )
}
