'use client'

import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarIcon, RefreshCw, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { PaginationControls } from '@/components/pagination-controls'
import { RoleGuard } from '@/components/role-guard'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDoorHistory } from '@/hooks/use-door-history'
import {
  formatDoorHistoryEventTime,
  formatDoorHistoryFetchedAt,
  getDoorHistoryTodayDateValue,
  refreshDoorHistory,
  sortDoorHistoryEvents,
} from '@/lib/door-history'
import { formatDateInputValue, parseDateInputValue } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'

const PAGE_SIZE = 50

function AccessBadge({ accessGranted }: { accessGranted: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={
        accessGranted
          ? 'bg-green-500/15 text-green-600 hover:bg-green-500/25'
          : 'bg-red-500/15 text-red-600 hover:bg-red-500/25'
      }
    >
      {accessGranted ? 'Granted' : 'Denied'}
    </Badge>
  )
}

function DoorHistoryPageContent() {
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(() => getDoorHistoryTodayDateValue())
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { data, isLoading, error, refetch } = useDoorHistory(selectedDate)
  const sortedEvents = useMemo(() => sortDoorHistoryEvents(data?.events ?? []), [data?.events])
  const paginatedEvents = useMemo(
    () => sortedEvents.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [currentPage, sortedEvents],
  )
  const totalRows = sortedEvents.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const todayDateValue = getDoorHistoryTodayDateValue()
  const selectedCalendarDate = parseDateInputValue(selectedDate)
  const displayedSelectedDate = selectedCalendarDate
    ? format(selectedCalendarDate, 'MMM. d, yyyy')
    : 'Select a date'

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedDate])

  useEffect(() => {
    setCurrentPage((page) => Math.max(0, Math.min(page, totalPages - 1)))
  }, [totalPages])

  const handleSelectedDateChange = (value: string) => {
    setSelectedDate(value)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)

    try {
      await refreshDoorHistory(selectedDate)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.doorHistory.byDate(selectedDate),
      })
      toast({
        title: 'Door history refreshed',
        description: `Loaded the latest door events for ${selectedDate}.`,
      })
    } catch (refreshError) {
      toast({
        title: 'Refresh failed',
        description:
          refreshError instanceof Error
            ? refreshError.message
            : 'Failed to refresh door history.',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Door History</h1>
          <p className="text-muted-foreground">
            Review door access events from the HikVision device for a selected date.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            {error.message || 'Failed to load door history.'}
          </p>
          <Button variant="outline" className="w-fit" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Door History</h1>
        <p className="text-muted-foreground">
          Review door access events from the HikVision device for a selected date.
        </p>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Label htmlFor="door-history-date">Date</Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="door-history-date"
                  type="button"
                  variant="outline"
                  className="w-full justify-between px-3 text-left font-normal md:w-[220px]"
                >
                  <span>{displayedSelectedDate}</span>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedCalendarDate ?? undefined}
                  defaultMonth={selectedCalendarDate ?? undefined}
                  onSelect={(date) => {
                    if (!date) {
                      return
                    }

                    handleSelectedDateChange(formatDateInputValue(date))
                    setIsDatePickerOpen(false)
                  }}
                  disabled={(date) => formatDateInputValue(date) > todayDateValue}
                />
              </PopoverContent>
            </Popover>
            <p className="text-sm text-muted-foreground">
              {data?.fetchedAt
                ? `Last fetched: ${formatDoorHistoryFetchedAt(data.fetchedAt)}`
                : 'Last fetched: Not recorded'}
            </p>
          </div>

          <Button type="button" onClick={() => void handleRefresh()} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4 rounded-lg border bg-background p-4">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={`door-history-skeleton-${index}`} className="h-12 w-full" />
          ))}
        </div>
      ) : data?.fetchedAt === null ? (
        <Empty className="rounded-lg border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <XIcon className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No cached door history</EmptyTitle>
            <EmptyDescription>
              Click Refresh to load door access events for {displayedSelectedDate}.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => void handleRefresh()} disabled={isRefreshing}>
              <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-b hover:bg-muted/40">
                <TableHead className="h-14 px-4 text-sm font-semibold">Time</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Member Name</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Card No</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Access</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Event Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalRows === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 px-4 text-center text-muted-foreground">
                    No door events found for this date.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEvents.map((event, index) => (
                  <TableRow key={`${event.time}-${event.cardNo}-${event.eventType ?? 'event'}-${index}`}>
                    <TableCell className="px-4 py-4">{formatDoorHistoryEventTime(event.time)}</TableCell>
                    <TableCell className="px-4 py-4 font-medium">
                      {event.memberName ?? 'Unknown'}
                    </TableCell>
                    <TableCell className="px-4 py-4 font-mono text-sm">
                      {event.cardNo || 'Unknown'}
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <AccessBadge accessGranted={event.accessGranted} />
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      {event.eventType ?? 'Not available'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalRows > 0 ? (
            <div className="flex flex-col gap-4 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {totalRows} {totalRows === 1 ? 'Row' : 'Rows'}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
                <p className="text-sm font-medium">
                  Page {currentPage + 1} of {totalPages}
                </p>
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function DoorHistoryPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <DoorHistoryPageContent />
    </RoleGuard>
  )
}
