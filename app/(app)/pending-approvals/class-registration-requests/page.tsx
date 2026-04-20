import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PendingClassRegistrationRequestsPage } from '@/components/pending-class-registration-requests-page'
import { RoleGuard } from '@/components/role-guard'

export default function PendingClassRegistrationRequestsRoute() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <PendingClassRegistrationRequestsPage />
    </RoleGuard>
  )
}
