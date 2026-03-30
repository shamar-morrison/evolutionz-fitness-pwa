'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import type { CheckInEvent } from '@/types'
import { Activity } from 'lucide-react'

type RecentActivityProps = {
  events: CheckInEvent[]
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

export function RecentActivity({ events }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-center text-muted-foreground">No recent activity</p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {event.memberName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-medium">{event.memberName}</p>
                    <StatusBadge status={event.status} className="mt-1" />
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatTimeAgo(event.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
