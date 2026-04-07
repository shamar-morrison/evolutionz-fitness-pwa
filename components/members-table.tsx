'use client'

import { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
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

export function MembersTable({ members }: MembersTableProps) {
  const router = useProgressRouter()
  const [pageSize, setPageSize] = useState<number>(Number(PAGE_SIZE_OPTIONS[0]))
  const [currentPage, setCurrentPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize))
  const paginatedMembers = members.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  useEffect(() => {
    setCurrentPage((page) => Math.max(0, Math.min(page, totalPages - 1)))
  }, [totalPages])

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-b hover:bg-muted/40">
            <TableHead className="h-14 px-4 text-sm font-semibold">Member</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Card ID</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Type</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Status</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">Start Date</TableHead>
            <TableHead className="h-14 px-4 text-sm font-semibold">End Date</TableHead>
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
                onClick={() => router.push(`/members/${member.id}`)}
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
                  setPageSize(Number(value))
                  setCurrentPage(0)
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
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
