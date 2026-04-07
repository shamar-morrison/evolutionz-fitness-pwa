'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { getBackLink, type AppRole } from '@/lib/route-config'

export function useBackLink(adminFallback: string, staffFallback: string): string {
  const pathname = usePathname()
  const { role } = useAuth()

  const appRole: AppRole = role === 'admin' ? 'admin' : 'staff'
  const fallback = appRole === 'admin' ? adminFallback : staffFallback

  return getBackLink(pathname, appRole, fallback)
}
