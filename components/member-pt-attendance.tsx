'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2 } from 'lucide-react'
import { PaginationControls } from '@/components/pagination-controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePtSessions } from '@/hooks/use-pt-scheduling'
import {
  formatPtSessionDateTime,
  formatPtSessionStatusLabel,
  getPtSessionStatusBadgeClassName,
} from '@/lib/pt-scheduling'

const PT_ATTENDANCE_PAGE_SIZE = 10

type MemberPtAttendanceProps = {
  memberId: string
}

function formatAttendanceRate(completedCount: number, missedCount: number) {
  const trackedTotal = completedCount + missedCount

  if (trackedTotal === 0) {
    return '0%'
  }

  return `${Math.round((completedCount / trackedTotal) * 100)}%`
}

export function MemberPtAttendance({ memberId }: MemberPtAttendanceProps) {
  const [page, setPage] = useState(0)
  const { sessions, isLoading, error, refetch } = usePtSessions({
    memberId,
    past: 'true',
  })
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const timeComparison = right.scheduledAt.localeCompare(left.scheduledAt)

        if (timeComparison !== 0) {
          return timeComparison
        }

        return right.id.localeCompare(left.id)
      }),
    [sessions],
  )
  const completedCount = useMemo(
    () => sortedSessions.filter((session) => session.status === 'completed').length,
    [sortedSessions],
  )
  const missedCount = useMemo(
    () => sortedSessions.filter((session) => session.status === 'missed').length,
    [sortedSessions],
  )
  const totalMatches = sortedSessions.length
  const totalPages = Math.max(1, Math.ceil(totalMatches / PT_ATTENDANCE_PAGE_SIZE))
  const currentPageSessions = useMemo(
    () =>
      sortedSessions.slice(
        page * PT_ATTENDANCE_PAGE_SIZE,
        (page + 1) * PT_ATTENDANCE_PAGE_SIZE,
      ),
    [page, sortedSessions],
  )
  const showPagination = totalMatches > PT_ATTENDANCE_PAGE_SIZE
  const rangeStart = totalMatches === 0 ? 0 : page * PT_ATTENDANCE_PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * PT_ATTENDANCE_PAGE_SIZE, totalMatches)

  useEffect(() => {
    setPage(0)
  }, [memberId])

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages - 1))
  }, [totalPages])

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarCheck2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>PT Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              {error.message || 'Failed to load PT attendance.'}
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
        <CalendarCheck2 className="h-5 w-5 text-muted-foreground" />
        <CardTitle>PT Attendance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total sessions completed</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-semibold">{completedCount}</p>
            )}
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total sessions missed</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-2 text-2xl font-semibold">{missedCount}</p>
            )}
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Attendance rate</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-20" />
            ) : (
              <p className="mt-2 text-2xl font-semibold">
                {formatAttendanceRate(completedCount, missedCount)}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Trainer</TableHead>
                <TableHead>Training Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={`pt-attendance-skeleton-${index}`}>
                    <TableCell>
                      <Skeleton className="h-5 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              ) : currentPageSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    No past PT sessions recorded.
                  </TableCell>
                </TableRow>
              ) : (
                currentPageSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatPtSessionDateTime(session.scheduledAt)}</TableCell>
                    <TableCell>{session.trainerName ?? 'Unknown trainer'}</TableCell>
                    <TableCell>{session.trainingTypeName ?? 'Not set'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={getPtSessionStatusBadgeClassName(session.status)}
                      >
                        {formatPtSessionStatusLabel(session.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {showPagination ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {rangeStart}-{rangeEnd} of {totalMatches}
            </p>
            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
