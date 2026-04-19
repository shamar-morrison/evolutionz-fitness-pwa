'use client'

import { EmailClient } from '@/app/(app)/email/email-client'
import { getResendDailyEmailLimit } from '@/lib/admin-email'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'

export default function EmailPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <EmailClient resendDailyLimit={getResendDailyEmailLimit()} />
    </RoleGuard>
  )
}
