'use client'

import { MemberReportsClient } from '@/app/(app)/reports/members/member-reports-client'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'

export default function MemberReportsPage() {
  return (
    <RoleGuard permission="reports.view" fallback={<AuthenticatedHomeRedirect />}>
      <MemberReportsClient />
    </RoleGuard>
  )
}
