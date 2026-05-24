'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import { useMedicalAssignments } from '@/hooks/use-medical'
import {
  formatMedicalDate,
  formatMedicalDateFromTimestamp,
  isMedicalFollowUpDue,
  type MedicalAssignment,
} from '@/lib/medical'

function sortActiveAssignments(assignments: MedicalAssignment[]) {
  return [...assignments].sort((left, right) => {
    const leftDue = left.followUpDate ? 0 : 1
    const rightDue = right.followUpDate ? 0 : 1

    if (leftDue !== rightDue) {
      return leftDue - rightDue
    }

    if (left.followUpDate && right.followUpDate && left.followUpDate !== right.followUpDate) {
      return left.followUpDate.localeCompare(right.followUpDate)
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  )
}

export default function MedicalWorkspacePage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.titles.includes('Owner')
  const {
    data: activeAssignments = [],
    isLoading: isActiveLoading,
    error: activeError,
  } = useMedicalAssignments({
    status: 'active',
  })
  const {
    data: completedAssignments = [],
    isLoading: isCompletedLoading,
    error: completedError,
  } = useMedicalAssignments({
    status: 'completed',
  })
  const sortedActiveAssignments = useMemo(
    () => sortActiveAssignments(activeAssignments),
    [activeAssignments],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isAdmin ? 'Medical Workspace' : 'My Clients'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? 'All active and completed medical/consultant assignments.'
            : 'Active and completed client assignments for medical follow-up.'}
        </p>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isActiveLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : activeError ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-destructive">
                  {activeError instanceof Error
                    ? activeError.message
                    : 'Failed to load active medical assignments.'}
                </p>
              </CardContent>
            </Card>
          ) : sortedActiveAssignments.length === 0 ? (
            <EmptyState message="No active clients assigned." />
          ) : (
            sortedActiveAssignments.map((assignment) => (
              <Card key={assignment.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle>{assignment.memberName}</CardTitle>
                    <p className="text-muted-foreground text-sm">
                      Assigned {formatMedicalDateFromTimestamp(assignment.createdAt)}
                    </p>
                    {isAdmin ? (
                      <p className="text-muted-foreground text-sm">
                        Staff: {assignment.staffName}
                      </p>
                    ) : null}
                  </div>
                  {assignment.followUpDate && isMedicalFollowUpDue(assignment.followUpDate) ? (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                      Follow-up due
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Membership:</span>{' '}
                      {assignment.memberType}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Status:</span>{' '}
                      {assignment.memberStatus}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Follow-up:</span>{' '}
                      {assignment.followUpDate
                        ? formatMedicalDate(assignment.followUpDate)
                        : 'Not set'}
                    </p>
                  </div>

                  <Button asChild variant="outline">
                    <Link data-progress href={`/medical/${assignment.id}`}>
                      View
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {isCompletedLoading ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : completedError ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-destructive">
                  {completedError instanceof Error
                    ? completedError.message
                    : 'Failed to load completed medical assignments.'}
                </p>
              </CardContent>
            </Card>
          ) : completedAssignments.length === 0 ? (
            <EmptyState message="No completed assignments yet." />
          ) : (
            completedAssignments.map((assignment) => (
              <Card key={assignment.id}>
                <CardContent className="flex flex-col gap-3 p-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{assignment.memberName}</p>
                    {isAdmin ? (
                      <p className="text-muted-foreground text-sm">
                        Staff: {assignment.staffName}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground text-sm">
                      Completed{' '}
                      {assignment.completedAt
                        ? formatMedicalDateFromTimestamp(assignment.completedAt)
                        : 'Unknown'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
