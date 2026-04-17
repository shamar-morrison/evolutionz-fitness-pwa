import { redirect } from 'next/navigation'
import { MemberReportsClient } from '@/app/(app)/reports/members/member-reports-client'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'

export default async function MemberReportsPage() {
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

  return <MemberReportsClient />
}
