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
  const { role: currentRole, loading } = useAuth()

  if (loading) {
    return null
  }

  if (!currentRole) {
    return fallback
  }

  // Admin can see everything, staff only sees staff-level content
  if (role === 'admin' && currentRole !== 'admin') {
    return fallback
  }

  return <>{children}</>
}
