'use client'

import { AppSidebar } from '@/components/app-sidebar'
import { TopNav } from '@/components/top-nav'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/toaster'
import type { ReactNode } from 'react'

type AppLayoutProps = {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-svh overflow-hidden">
          <div className="flex h-full flex-col bg-background">
            <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
              <div className="container mx-auto flex h-16 items-center px-4 sm:px-6">
                <TopNav />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="container mx-auto p-4 sm:p-6">{children}</div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </>
  )
}
