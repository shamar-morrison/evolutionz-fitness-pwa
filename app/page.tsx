import { redirect } from 'next/navigation'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user ? await readStaffProfile(supabase as any, user.id) : null

  redirect(getAuthenticatedHomePath(profile?.role))
}
