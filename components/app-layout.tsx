'use client'

import { Sidebar } from '@/components/sidebar'
import { AuthProvider } from '@/contexts/auth-context'
import type { ReactNode } from 'react'

type AppLayoutProps = {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
    </AuthProvider>
  )
}
