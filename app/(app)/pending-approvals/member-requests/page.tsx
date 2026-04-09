import { PendingMemberRequestsPage } from '@/components/pending-member-requests-page'
import { RedirectOnMount } from '@/components/redirect-on-mount'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<RedirectOnMount href="/trainer/schedule" />}>
      <PendingMemberRequestsPage />
    </RoleGuard>
  )
}
