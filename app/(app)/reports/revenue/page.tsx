'use client'

import { RevenueReportClient } from '@/app/(app)/reports/revenue/revenue-report-client'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'

export default function RevenueReportsPage() {
  return (
    <RoleGuard permission="reports.view" fallback={<AuthenticatedHomeRedirect />}>
      <RevenueReportClient />
    </RoleGuard>
  )
}
