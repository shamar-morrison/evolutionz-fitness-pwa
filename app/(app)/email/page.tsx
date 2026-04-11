import { redirect } from 'next/navigation'
import { EmailClient } from '@/app/(app)/email/email-client'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'

function getResendDailyEmailLimit() {
  const configuredLimit = parseInt(process.env.RESEND_DAILY_EMAIL_LIMIT ?? '100', 10)

  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return 100
  }

  return configuredLimit
}

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
