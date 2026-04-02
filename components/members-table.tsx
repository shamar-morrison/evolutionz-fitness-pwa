'use client'

import { useRouter } from 'next/navigation'
import { formatAccessDate } from '@/lib/member-access-time'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
import type { Member } from '@/types'

type MembersTableProps = {
  members: Member[]
}

export function MembersTable({ members }: MembersTableProps) {
  const router = useRouter()

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Card ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>End Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => (
              <TableRow
                key={member.id}
                onClick={() => router.push(`/members/${member.id}`)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={getCleanMemberName(member.name, member.cardCode)} size="sm" />
                    <span className="font-medium">
                      {buildMemberDisplayName(member.name, member.cardCode)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-sm">{member.cardNo ?? 'Unassigned'}</span>
                    {member.deviceAccessState === 'released' && member.slotPlaceholderName ? (
                      <span className="text-xs text-muted-foreground">
                        Released to {member.slotPlaceholderName}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{member.type}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={member.status} />
                    {member.deviceAccessState === 'released' ? (
                      <Badge className="bg-slate-500/15 text-slate-700 hover:bg-slate-500/25">
                        Slot Released
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{formatAccessDate(member.endTime)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
