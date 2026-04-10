'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { getBackLink, isRouteAllowed, type AppRole } from '@/lib/route-config'

function getDefaultHomePath(role: AppRole, titles: string[]) {
  if (role === 'admin') {
    return '/dashboard'
  }

  if (titles.includes('Trainer')) {
    return '/trainer/schedule'
  }

  if (titles.includes('Administrative Assistant')) {
    return '/members'
  }

  return '/unauthorized'
}

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

  return getDefaultHomePath(appRole, titles)
}
