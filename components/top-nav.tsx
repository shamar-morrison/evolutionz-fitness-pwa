'use client'

import { NotificationsPanel } from '@/components/notifications-panel'

export function TopNav() {
  return (
    <div className="flex items-center justify-end">
      <NotificationsPanel />
    </div>
  )
}
