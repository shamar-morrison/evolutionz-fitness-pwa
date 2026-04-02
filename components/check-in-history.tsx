'use client'

import { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberEvents } from '@/hooks/useMemberEvents'
import { MEMBER_EVENTS_PAGE_SIZE, formatMemberEventTime } from '@/lib/member-events'
import { Clock } from 'lucide-react'

type CheckInHistoryProps = {
  memberId: string
}

export function CheckInHistory({ memberId }: CheckInHistoryProps) {
  const [page, setPage] = useState(0)
  const { data, isLoading, error, refetch } = useMemberEvents(memberId, page)

  useEffect(() => {
    setPage(0)
  }, [memberId])

  const events = data?.events ?? []
  const totalMatches = data?.totalMatches ?? 0
  const showPagination = totalMatches > MEMBER_EVENTS_PAGE_SIZE
  const canGoPrevious = page > 0
  const canGoNext = (page + 1) * MEMBER_EVENTS_PAGE_SIZE < totalMatches
  const rangeStart = totalMatches === 0 ? 0 : page * MEMBER_EVENTS_PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * MEMBER_EVENTS_PAGE_SIZE, totalMatches)

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Check-In History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              {error.message || 'Failed to load check-in history'}
            </p>
            <Button variant="outline" className="w-fit" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={`member-events-skeleton-${index}`}>
                    <TableCell>
                      <Skeleton className="h-5 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-36" />
                    </TableCell>
                  </TableRow>
                ))
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                    No check-in history
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event, index) => (
                  <TableRow
                    key={`${event.time}-${event.minor}-${event.cardNo ?? 'no-card'}-${index}`}
                  >
                    <TableCell>{formatMemberEventTime(event.time)}</TableCell>
                    <TableCell>
                      <StatusBadge status={event.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {showPagination ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {rangeStart}-{rangeEnd} of {totalMatches}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                disabled={!canGoPrevious}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((currentPage) => currentPage + 1)}
                disabled={!canGoNext}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          null
        )}
      </CardContent>
    </Card>
  )
}
