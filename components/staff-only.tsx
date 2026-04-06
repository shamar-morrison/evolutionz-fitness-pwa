'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { RedirectOnMount } from '@/components/redirect-on-mount'

type StaffOnlyProps = {
  children: ReactNode
  adminRedirectTo?: string
}

export function StaffOnly({ children, adminRedirectTo = '/schedule' }: StaffOnlyProps) {
  const { role, loading } = useAuth()

  if (loading || !role) {
    return null
  }

  if (role === 'admin') {
    return <RedirectOnMount href={adminRedirectTo} />
  }

  return <>{children}</>
}
