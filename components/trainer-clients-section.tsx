'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { MemberAvatar } from '@/components/member-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrainerPtAssignments } from '@/hooks/use-pt-scheduling'
import {
  formatOptionalJmdCurrency,
  formatScheduleSummary,
  normalizeTrainingPlan,
} from '@/lib/pt-scheduling'

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
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
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
          <div className="grid gap-4 md:grid-cols-2">
            {assignments.map((assignment) => {
              const trainingPlan = normalizeTrainingPlan(assignment.trainingPlan)

              return (
                <div
                  key={assignment.id}
                  className="flex h-full flex-col rounded-xl border border-border/80 bg-background/70 p-5"
                >
                  <div className="flex items-start gap-3">
                    <MemberAvatar
                      name={assignment.memberName ?? 'Member'}
                      photoUrl={assignment.memberPhotoUrl ?? null}
                      size="md"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium leading-tight">
                        {assignment.memberName ?? 'Unknown member'}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {formatScheduleSummary(assignment.scheduledSessions, assignment.sessionsPerWeek)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="text-sm">
                      <p className="text-muted-foreground">Training Plan</p>
                      {trainingPlan.length > 0 ? (
                        <ul className="mt-2 space-y-1.5">
                          {trainingPlan.map((entry) => (
                            <li key={entry.day}>
                              {entry.day} &rarr; {entry.trainingTypeName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2">Not set</p>
                      )}
                    </div>

                    <div className="text-sm">
                      <p className="text-muted-foreground">PT Fee</p>
                      <p className="mt-1 font-medium">{formatOptionalJmdCurrency(assignment.ptFee)}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex justify-end pt-4">
                    <Button asChild variant="outline" className='min-w-full'>
                      <Link data-progress href={`/members/${assignment.memberId}`}>
                        View
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
