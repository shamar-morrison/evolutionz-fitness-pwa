import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PendingMemberPaymentRequestsPage } from '@/components/pending-member-payment-requests-page'
import { RoleGuard } from '@/components/role-guard'

export default function PendingMemberPaymentRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingMemberPaymentRequestsPage />
    </RoleGuard>
  )
}
