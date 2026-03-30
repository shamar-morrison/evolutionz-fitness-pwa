'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCheckInHistory } from '@/hooks/use-check-in-history'
import { Clock } from 'lucide-react'

type CheckInHistoryProps = {
  memberId: string
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-JM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CheckInHistory({ memberId }: CheckInHistoryProps) {
  const { history, isLoading, error } = useCheckInHistory(memberId)

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Check-In History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Failed to load check-in history</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <CardTitle>Check-In History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                      No check-in history
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{formatDateTime(event.timestamp)}</TableCell>
                      <TableCell>
                        <StatusBadge status={event.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
