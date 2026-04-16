'use client'

import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarIcon, RefreshCw, XIcon } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { useDoorHistory } from '@/hooks/use-door-history'
import {
  formatDoorHistoryEventTime,
  formatDoorHistoryFetchedAt,
  getDoorHistoryTodayDateValue,
  refreshDoorHistory,
  sortDoorHistoryEvents,
} from '@/lib/door-history'
import { replaceCurrentUrl } from '@/lib/client-history'
import { formatDateInputValue, parseDateInputValue } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'

const PAGE_SIZE = 50
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
type AccessFilter = 'all' | 'granted' | 'denied'

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value || !/^\d+$/u.test(value)) {
    return fallback
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return fallback
  }

  return parsedValue
}

function buildReturnTo(pathname: string | null, searchParams: ReadonlyURLSearchParams | null) {
  if (!pathname) {
    return null
  }

  const query = searchParams?.toString() ?? ''

  return query ? `${pathname}?${query}` : pathname
}

function isValidAccessFilter(value: string | null): value is AccessFilter {
  return value === 'all' || value === 'granted' || value === 'denied'
}

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
  const router = useProgressRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams?.toString() ?? ''
  const queryClient = useQueryClient()
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const todayDateValue = getDoorHistoryTodayDateValue()
  const selectedDate = (() => {
    const param = searchParams?.get('date') ?? null
    return param && DATE_PATTERN.test(param) ? param : todayDateValue
  })()
  const accessFilter = (() => {
    const param = searchParams?.get('access') ?? null
    return isValidAccessFilter(param) ? param : 'all'
  })()
  const showUnknownEntries = searchParams?.get('unknown') === '1'
  const { data, isLoading, error, refetch } = useDoorHistory(selectedDate)
  const sortedEvents = useMemo(() => sortDoorHistoryEvents(data?.events ?? []), [data?.events])
  const filteredEvents = useMemo(() => {
    const accessFilteredEvents = (() => {
      switch (accessFilter) {
        case 'granted':
          return sortedEvents.filter((event) => event.accessGranted)
        case 'denied':
          return sortedEvents.filter((event) => !event.accessGranted)
        default:
          return sortedEvents
      }
    })()

    if (showUnknownEntries) {
      return accessFilteredEvents
    }

    return accessFilteredEvents.filter(
      (event) => !(event.memberName === null && !event.cardNo),
    )
  }, [accessFilter, showUnknownEntries, sortedEvents])
  const totalRows = filteredEvents.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const requestedPage = parsePositiveInteger(searchParams?.get('page') ?? null, 1) - 1
  const currentPage = Math.max(0, Math.min(requestedPage, totalPages - 1))
  const paginatedEvents = useMemo(
    () => filteredEvents.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [currentPage, filteredEvents],
  )
  const selectedCalendarDate = parseDateInputValue(selectedDate)
  const displayedSelectedDate = selectedCalendarDate
    ? format(selectedCalendarDate, 'MMM. d, yyyy')
    : 'Select a date'
  const hasFilteredResults = sortedEvents.length > 0 && totalRows === 0
  const emptyTableMessage =
    accessFilter === 'granted'
      ? 'No granted access events found for this date.'
      : accessFilter === 'denied'
        ? 'No denied access events found for this date.'
        : 'No door events found for this date.'

  const updateSearchParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParamsString)

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }

      const query = params.toString()
      replaceCurrentUrl(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, searchParamsString],
  )

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString)

    if (selectedDate !== todayDateValue) {
      params.set('date', selectedDate)
    } else {
      params.delete('date')
    }

    if (accessFilter !== 'all') {
      params.set('access', accessFilter)
    } else {
      params.delete('access')
    }

    if (showUnknownEntries) {
      params.set('unknown', '1')
    } else {
      params.delete('unknown')
    }

    if (currentPage > 0) {
      params.set('page', String(currentPage + 1))
    } else {
      params.delete('page')
    }

    const normalizedQuery = params.toString()

    if (normalizedQuery !== searchParamsString) {
      const href = normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname
      replaceCurrentUrl(href)
    }
  }, [
    accessFilter,
    currentPage,
    pathname,
    searchParamsString,
    selectedDate,
    showUnknownEntries,
    todayDateValue,
  ])

  const handleSelectedDateChange = (value: string) => {
    updateSearchParams({
      date: value === todayDateValue ? '' : value,
      page: '',
    })
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="grid grid-cols-2 gap-4 md:flex md:flex-wrap md:items-end">
              <div className="min-w-0 space-y-2 md:w-[220px]">
                <Label htmlFor="door-history-date">Date</Label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="door-history-date"
                      type="button"
                      variant="outline"
                      className="w-full justify-between px-3 text-left font-normal"
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
              </div>

              <div className="min-w-0 space-y-2 md:w-[220px]">
                <Label htmlFor="door-history-access-filter">Access</Label>
                <Select
                  value={accessFilter}
                  onValueChange={(value) => {
                    updateSearchParams({
                      access: value === 'all' ? '' : value,
                      page: '',
                    })
                  }}
                >
                  <SelectTrigger id="door-history-access-filter" className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="granted">Granted</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="door-history-show-unknown" className="text-sm font-medium">
                Show unknown entries
              </Label>
              <Switch
                id="door-history-show-unknown"
                checked={showUnknownEntries}
                onCheckedChange={(checked) => {
                  updateSearchParams({
                    unknown: checked ? '1' : '',
                    page: '',
                  })
                }}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              {data?.fetchedAt
                ? `Last fetched: ${formatDoorHistoryFetchedAt(data.fetchedAt)}`
                : 'Last fetched: Not recorded'}
            </p>
          </div>

          <Button
            type="button"
            className="w-full lg:w-auto"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
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
                    {hasFilteredResults ? emptyTableMessage : 'No door events found for this date.'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEvents.map((event, index) => (
                  <TableRow
                    key={`${event.time}-${event.cardNo}-${event.eventType ?? 'event'}-${index}`}
                    className={event.memberId ? 'cursor-pointer' : undefined}
                    onClick={
                      event.memberId
                        ? () => {
                            const returnTo = buildReturnTo(pathname, searchParams)
                            const href = returnTo
                              ? `/members/${event.memberId}?returnTo=${encodeURIComponent(returnTo)}`
                              : `/members/${event.memberId}`

                            router.push(href)
                          }
                        : undefined
                    }
                  >
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
                  onPageChange={(page) =>
                    updateSearchParams({ page: page > 0 ? String(page + 1) : '' })
                  }
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
      <Suspense>
        <DoorHistoryPageContent />
      </Suspense>
    </RoleGuard>
  )
}
