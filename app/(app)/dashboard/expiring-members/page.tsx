'use client'

import { ArrowLeft } from 'lucide-react'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useExpiringDashboardMembers } from '@/hooks/use-dashboard-members'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { formatAccessDate } from '@/lib/member-access-time'

function ExpiringMembersPageContent() {
  const router = useProgressRouter()
  const { data: expiringMembers, isLoading, error } = useExpiringDashboardMembers()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/dashboard')}
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expiring Members</h1>
          <p className="text-muted-foreground">
            All active memberships ending within the next 7 days.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-4">
          <p className="text-destructive">Failed to load expiring members</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      ) : expiringMembers.length === 0 ? (
        <div className="rounded-lg border bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          No memberships expiring in the next 7 days.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-b hover:bg-muted/40">
                <TableHead className="h-14 px-4 text-sm font-semibold">Member</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Type</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">Status</TableHead>
                <TableHead className="h-14 px-4 text-sm font-semibold">End Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expiringMembers.map((member) => (
                <TableRow
                  key={member.id}
                  onClick={() => router.push(`/members/${member.id}`)}
                  className="cursor-pointer hover:bg-muted/20"
                >
                  <TableCell className="px-4 py-4">
                    <span className="font-medium">{member.name}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <Badge variant="outline">{member.type}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <StatusBadge status={member.status} />
                  </TableCell>
                  <TableCell className="px-4 py-4">{formatAccessDate(member.endTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default function ExpiringMembersPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <ExpiringMembersPageContent />
    </RoleGuard>
  )
}
