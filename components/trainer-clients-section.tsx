'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { MemberAvatar } from '@/components/member-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrainerPtAssignments } from '@/hooks/use-pt-scheduling'
import { formatJmdCurrency, formatScheduleSummary, normalizeTrainingPlan } from '@/lib/pt-scheduling'

type TrainerClientsSectionProps = {
  trainerId: string
}

export function TrainerClientsSection({ trainerId }: TrainerClientsSectionProps) {
  const { assignments, isLoading, error } = useTrainerPtAssignments(trainerId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : 'Failed to load trainer clients.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <CardTitle>Clients</CardTitle>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="font-medium">No clients assigned</p>
            <p className="text-muted-foreground mt-1 text-sm">
              This trainer does not have any active PT assignments yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={assignment.memberName ?? 'Member'}
                    photoUrl={assignment.memberPhotoUrl ?? null}
                    size="md"
                  />
                  <div className="space-y-1">
                    <p className="font-medium">{assignment.memberName ?? 'Unknown member'}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatScheduleSummary(assignment.scheduledDays, assignment.sessionTime)}
                    </p>
                    <div className="text-sm">
                      <p className="text-muted-foreground">Training Plan</p>
                      {normalizeTrainingPlan(assignment.trainingPlan).length > 0 ? (
                        <ul className="space-y-1">
                          {normalizeTrainingPlan(assignment.trainingPlan).map((entry) => (
                            <li key={entry.day}>
                              {entry.day} &rarr; {entry.trainingTypeName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Not set</p>
                      )}
                    </div>
                    <p className="text-sm">{formatJmdCurrency(assignment.ptFee)}</p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link data-progress href={`/members/${assignment.memberId}`}>
                    View
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
