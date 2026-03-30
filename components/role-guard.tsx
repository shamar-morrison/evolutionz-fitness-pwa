'use client'

import { useAuth } from '@/contexts/auth-context'
import type { UserRole } from '@/types'
import type { ReactNode } from 'react'

type RoleGuardProps = {
  role: UserRole
  children: ReactNode
  fallback?: ReactNode
}

export function RoleGuard({ role, children, fallback = null }: RoleGuardProps) {
  const { user } = useAuth()

  if (!user) {
    return fallback
  }

  // Admin can see everything, staff only sees staff-level content
  if (role === 'admin' && user.role !== 'admin') {
    return fallback
  }

  return <>{children}</>
}
