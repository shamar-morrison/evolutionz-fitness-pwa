'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { StaffOnly } from '@/components/staff-only'
import { MemberAvatar } from '@/components/member-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useTrainerPtAssignments } from '@/hooks/use-pt-scheduling'
import { formatScheduleSummary, normalizeTrainingPlan } from '@/lib/pt-scheduling'

function TrainerClientsContent() {
  const { profile } = useAuth()
  const trainerId = profile?.id ?? ''
  const { assignments, isLoading, error } = useTrainerPtAssignments(trainerId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Clients</h1>
        <p className="text-sm text-muted-foreground">
          Active client assignments, weekly schedules, and training plans.
        </p>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load trainer clients.'}
            </p>
          </CardContent>
        </Card>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No clients assigned.
          </CardContent>
        </Card>
      ) : (
        assignments.map((assignment) => (
          <Card key={assignment.id}>
            <CardHeader className="flex flex-row items-center gap-3">
              <MemberAvatar
                name={assignment.memberName ?? 'Member'}
                photoUrl={assignment.memberPhotoUrl ?? null}
                size="lg"
              />
              <div>
                <CardTitle>{assignment.memberName ?? 'Unknown member'}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {formatScheduleSummary(assignment.scheduledSessions, assignment.sessionsPerWeek)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Training Plan
                    </div>
                    {normalizeTrainingPlan(assignment.trainingPlan).length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {normalizeTrainingPlan(assignment.trainingPlan).map((entry) => (
                          <div
                            key={entry.day}
                            className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                          >
                            {entry.day} → {entry.trainingTypeName}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not set</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Assignment Notes</p>
                    <p className="rounded-lg border bg-muted/20 px-3 py-3 text-sm">
                      {assignment.notes ?? 'No notes'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start justify-start lg:justify-end">
                  <Button asChild variant="outline">
                    <Link data-progress href={`/members/${assignment.memberId}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export default function TrainerClientsPage() {
  return (
    <StaffOnly>
      <TrainerClientsContent />
    </StaffOnly>
  )
}
