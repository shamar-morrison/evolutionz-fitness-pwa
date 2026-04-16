'use client'

import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { PaginationControls } from '@/components/pagination-controls'
import { formatAccessDate } from '@/lib/member-access-time'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildMemberDisplayName } from '@/lib/member-name'
import type { Member } from '@/types'

type MembersTableProps = {
  members: Member[]
}

const PAGE_SIZE_OPTIONS = ['10', '25', '50'] as const
type SortColumn = 'beginTime' | 'endTime'
type SortDirection = 'asc' | 'desc'

const DEFAULT_PAGE_SIZE = Number(PAGE_SIZE_OPTIONS[0])

function isValidPageSize(value: string | null): value is (typeof PAGE_SIZE_OPTIONS)[number] {
  return value !== null && PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])
}

function isValidSortColumn(value: string | null): value is SortColumn {
  return value === 'beginTime' || value === 'endTime'
}

function isValidSortDirection(value: string | null): value is SortDirection {
  return value === 'asc' || value === 'desc'
}

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

function buildReturnTo(pathname: string, searchParams: ReadonlyURLSearchParams) {
  const query = searchParams.toString()

  return query ? `${pathname}?${query}` : pathname
}

function getSortableDateTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return null
  }

  return timestamp
}

export function MembersTable({ members }: MembersTableProps) {
  const router = useProgressRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageSizeParam = searchParams.get('pageSize')
  const sortParam = searchParams.get('sort')
  const directionParam = searchParams.get('direction')
  const pageSize = isValidPageSize(pageSizeParam)
    ? Number(pageSizeParam)
    : DEFAULT_PAGE_SIZE
  const sortColumn = isValidSortColumn(sortParam) ? sortParam : null
  const sortDirection =
    sortColumn && isValidSortDirection(directionParam)
      ? directionParam
      : null

  const sortedMembers = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return members
    }

    return [...members].sort((leftMember, rightMember) => {
      const leftTimestamp = getSortableDateTimestamp(leftMember[sortColumn])
      const rightTimestamp = getSortableDateTimestamp(rightMember[sortColumn])

      if (leftTimestamp === null && rightTimestamp === null) {
        return 0
      }

      if (leftTimestamp === null) {
        return 1
      }

      if (rightTimestamp === null) {
        return -1
      }

      return sortDirection === 'asc'
        ? leftTimestamp - rightTimestamp
        : rightTimestamp - leftTimestamp
    })
  }, [members, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedMembers.length / pageSize))
  const requestedPage = parsePositiveInteger(searchParams.get('page'), 1) - 1
  const currentPage = Math.max(0, Math.min(requestedPage, totalPages - 1))
  const paginatedMembers = sortedMembers.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  const updateSearchParams = useCallback(
    (nextState: {
      page?: number
      pageSize?: number
      sortColumn?: SortColumn | null
      sortDirection?: SortDirection | null
    }) => {
      const nextPage = nextState.page ?? currentPage
      const nextPageSize = nextState.pageSize ?? pageSize
      const nextSortColumn =
        nextState.sortColumn === undefined ? sortColumn : nextState.sortColumn
      const nextSortDirection =
        nextState.sortDirection === undefined ? sortDirection : nextState.sortDirection
      const params = new URLSearchParams(searchParams.toString())

      if (nextPage > 0) {
        params.set('page', String(nextPage + 1))
      } else {
        params.delete('page')
      }

      if (nextPageSize !== DEFAULT_PAGE_SIZE) {
        params.set('pageSize', String(nextPageSize))
      } else {
        params.delete('pageSize')
      }

      if (nextSortColumn && nextSortDirection) {
        params.set('sort', nextSortColumn)
        params.set('direction', nextSortDirection)
      } else {
        params.delete('sort')
        params.delete('direction')
      }

      const query = params.toString()
      const href = query ? `${pathname}?${query}` : pathname

      router.replace(href, { scroll: false })
    },
    [currentPage, pageSize, pathname, router, searchParams, sortColumn, sortDirection],
  )

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (currentPage > 0) {
      params.set('page', String(currentPage + 1))
    } else {
      params.delete('page')
    }

    if (pageSize !== DEFAULT_PAGE_SIZE) {
      params.set('pageSize', String(pageSize))
    } else {
      params.delete('pageSize')
    }

    if (sortColumn && sortDirection) {
      params.set('sort', sortColumn)
      params.set('direction', sortDirection)
    } else {
      params.delete('sort')
      params.delete('direction')
    }

    const normalizedQuery = params.toString()

    if (normalizedQuery !== searchParams.toString()) {
      const href = normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname
      router.replace(href, { scroll: false })
    }
  }, [currentPage, pageSize, pathname, router, searchParams, sortColumn, sortDirection])

  const handleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      updateSearchParams({
        page: 0,
        sortColumn: column,
        sortDirection: 'asc',
      })
      return
    }

    updateSearchParams({
      page: 0,
      sortColumn: column,
      sortDirection: sortDirection === 'asc' ? 'desc' : 'asc',
    })
  }

  const getAriaSort = (column: SortColumn) => {
    if (sortColumn !== column || !sortDirection) {
      return undefined
    }

    return sortDirection === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-b hover:bg-muted/40">
            <TableHead className="h-14 px-4 text-sm font-semibold">Member</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Card ID</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Type</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Status</TableHead>
            <TableHead
              aria-sort={getAriaSort('beginTime')}
              className="h-14 px-4 text-sm font-semibold"
            >
              <button
                type="button"
                className="flex items-center gap-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => handleSort('beginTime')}
              >
                <span>Start Date</span>
                {sortColumn === 'beginTime' && sortDirection === 'asc' ? (
                  <ArrowUp aria-hidden="true" className="h-4 w-4 shrink-0" />
                ) : null}
                {sortColumn === 'beginTime' && sortDirection === 'desc' ? (
                  <ArrowDown aria-hidden="true" className="h-4 w-4 shrink-0" />
                ) : null}
              </button>
            </TableHead>
            <TableHead
              aria-sort={getAriaSort('endTime')}
              className="h-14 px-4 text-sm font-semibold"
            >
              <button
                type="button"
                className="flex items-center gap-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => handleSort('endTime')}
              >
                <span>End Date</span>
                {sortColumn === 'endTime' && sortDirection === 'asc' ? (
                  <ArrowUp aria-hidden="true" className="h-4 w-4 shrink-0" />
                ) : null}
                {sortColumn === 'endTime' && sortDirection === 'desc' ? (
                  <ArrowDown aria-hidden="true" className="h-4 w-4 shrink-0" />
                ) : null}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 px-4 text-center text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          ) : (
            paginatedMembers.map((member) => (
              <TableRow
                key={member.id}
                onClick={() =>
                  router.push(
                    `/members/${member.id}?returnTo=${encodeURIComponent(
                      buildReturnTo(pathname, searchParams),
                    )}`,
                  )
                }
                className="cursor-pointer hover:bg-muted/20"
              >
                <TableCell className="px-4 py-4">
                  <span className="font-medium">{buildMemberDisplayName(member.name, member.cardCode)}</span>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">{member.cardNo ?? 'Unassigned'}</span>
                    {member.deviceAccessState === 'released' && member.slotPlaceholderName ? (
                      <span className="text-xs text-muted-foreground">
                        Released to {member.slotPlaceholderName}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <Badge variant="outline">{member.type}</Badge>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={member.status} />
                    {member.deviceAccessState === 'released' ? (
                      <Badge className="bg-slate-500/15 text-slate-700 hover:bg-slate-500/25">
                        Slot Released
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4">{formatAccessDate(member.beginTime)}</TableCell>
                <TableCell className="px-4 py-4">{formatAccessDate(member.endTime)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {members.length > 0 ? (
        <div className="flex flex-col gap-4 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'Row' : 'Rows'}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  updateSearchParams({
                    page: 0,
                    pageSize: Number(value),
                  })
                }}
              >
                <SelectTrigger className="h-9 w-[92px] rounded-md bg-background text-sm shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm font-medium">
              Page {currentPage + 1} of {totalPages}
            </p>
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => updateSearchParams({ page })}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
