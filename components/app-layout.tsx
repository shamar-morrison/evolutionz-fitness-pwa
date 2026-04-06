'use client'

import { Sidebar } from '@/components/sidebar'
import { TopNav } from '@/components/top-nav'
import { Toaster } from '@/components/ui/toaster'
import type { ReactNode } from 'react'

type AppLayoutProps = {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
            <div className="container mx-auto flex h-16 items-center justify-end px-6">
              <TopNav />
            </div>
          </div>
          <div className="container mx-auto p-6">{children}</div>
        </main>
      </div>
      <Toaster />
    </>
  )
}
