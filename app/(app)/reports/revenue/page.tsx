import { redirect } from 'next/navigation'
import { RevenueReportClient } from '@/app/(app)/reports/revenue/revenue-report-client'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'

export default async function RevenueReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await readStaffProfile(supabase as any, user.id)

  if (!profile || profile.role !== 'admin') {
    redirect('/unauthorized')
  }

  return <RevenueReportClient />
}
