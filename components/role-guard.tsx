'use client'

import { useAuth } from '@/contexts/auth-context'
import { usePermissions } from '@/hooks/use-permissions'
import type { Permission } from '@/lib/permissions'
import type { ReactNode } from 'react'

type RoleGuardProps = {
  children: ReactNode
  fallback?: ReactNode
} & (
  | { role: 'admin' | 'staff'; permission?: never }
  | { permission: Permission; role?: never }
)

export function RoleGuard(props: RoleGuardProps) {
  const { role: currentRole, loading } = useAuth()
  const { can } = usePermissions()
  const { children, fallback = null } = props

  if (loading) {
    return null
  }

  const isAllowed =
    'role' in props ? currentRole === props.role : can(props.permission)

  return isAllowed ? <>{children}</> : (fallback ?? null)
}
