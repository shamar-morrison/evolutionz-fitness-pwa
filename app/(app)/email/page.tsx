import { redirect } from 'next/navigation'
import { EmailClient } from '@/app/(app)/email/email-client'
import { getResendDailyEmailLimit } from '@/lib/admin-email'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'

export default async function EmailPage() {
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

  return <EmailClient resendDailyLimit={getResendDailyEmailLimit()} />
}
