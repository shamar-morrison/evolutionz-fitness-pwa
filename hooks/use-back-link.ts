'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { getBackLink, isRouteAllowed, type AppRole } from '@/lib/route-config'

export function useBackLink(adminFallback: string, staffFallback: string): string {
  const pathname = usePathname()
  const { profile, role } = useAuth()

  const titles = profile?.titles ?? []
  const appRole: AppRole = role === 'admin' || titles.includes('Owner') ? 'admin' : 'staff'
  const fallback = appRole === 'admin' ? adminFallback : staffFallback
  const resolvedBackLink = getBackLink(pathname, appRole, titles, fallback)

  if (isRouteAllowed(resolvedBackLink, appRole, titles)) {
    return resolvedBackLink
  }

  return getAuthenticatedHomePath(appRole, titles)
}
