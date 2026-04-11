'use client'

import { useAuth } from '@/contexts/auth-context'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { RedirectOnMount } from '@/components/redirect-on-mount'

export function AuthenticatedHomeRedirect() {
  const { profile, role } = useAuth()

  return <RedirectOnMount href={getAuthenticatedHomePath(role, profile?.titles)} />
}
