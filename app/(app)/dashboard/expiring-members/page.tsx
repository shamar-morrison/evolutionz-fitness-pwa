'use client'

import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { MembersTable } from '@/components/members-table'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMembers } from '@/hooks/use-members'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { isWithinJamaicaExpiringWindow } from '@/lib/member-access-time'

function ExpiringMembersPageContent() {
  const router = useProgressRouter()
  const { members, isLoading, error } = useMembers({ status: 'Active' })
  const expiringMembers = useMemo(() => {
    const now = new Date()

    return members.filter((member) => isWithinJamaicaExpiringWindow(member.endTime, now))
  }, [members])

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
        <MembersTable members={expiringMembers} />
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
