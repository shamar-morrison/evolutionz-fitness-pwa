'use client'

import { NotificationsPanel } from '@/components/notifications-panel'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function TopNav() {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <SidebarTrigger />
      <div className="flex items-center justify-end">
        <NotificationsPanel />
      </div>
    </div>
  )
}
