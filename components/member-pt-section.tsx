'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Trash2, UserRoundPlus } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PtAssignmentDialog } from '@/components/pt-assignment-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/use-permissions'
import { usePtAssignments, useMemberPtAssignment } from '@/hooks/use-pt-scheduling'
import { useStaff } from '@/hooks/use-staff'
import { toast } from '@/hooks/use-toast'
import {
  deletePtAssignment,
  formatJmdCurrency,
  formatScheduleSummary,
  generatePtAssignmentSessions,
  getMonthLabel,
  getMonthValueInJamaica,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeTrainingPlan,
  parseMonthValue,
  type TrainerClient,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { hasStaffTitle, isFrontDeskStaff } from '@/lib/staff'

type MemberPtSectionProps = {
  memberId: string
}

type RemovalAction = 'keep' | 'cancel-future'

async function invalidatePtQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  memberId: string,
  assignmentId?: string,
  trainerIds: ReadonlyArray<string | null | undefined> = [],
) {
  const affectedTrainerIds = Array.from(
    new Set(
      trainerIds.filter((trainerId): trainerId is string => typeof trainerId === 'string'),
    ),
  )

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.assignments }),
    assignmentId
      ? queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.assignment(assignmentId) })
      : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.memberAssignment(memberId) }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    }),
    ...affectedTrainerIds.flatMap((trainerId) => [
      queryClient.invalidateQueries({
        queryKey: queryKeys.ptScheduling.trainerAssignments(trainerId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.staff.detail(trainerId),
      }),
    ]),
  ])
}

export function MemberPtSection({ memberId }: MemberPtSectionProps) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { can } = usePermissions()
  const currentMonthValue = getMonthValueInJamaica()
  const currentMonth = parseMonthValue(currentMonthValue)
  const isFrontDesk = isFrontDeskStaff(profile?.titles)
  const canAssignTrainer = can('pt.assign')
  const { assignment, isLoading, error } = useMemberPtAssignment(memberId)
  const allAssignmentsQuery = usePtAssignments({ memberId })
  const { staff, isLoading: isStaffLoading } = useStaff({ enabled: canAssignTrainer })
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [pendingGenerateAssignment, setPendingGenerateAssignment] = useState<TrainerClient | null>(null)
  const [removalAction, setRemovalAction] = useState<RemovalAction | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const isRemoving = removalAction !== null
  const availableTrainers = useMemo(() => {
    if (!canAssignTrainer) {
      return []
    }

    const unavailableTrainerIds = new Set(
      (allAssignmentsQuery.data ?? []).map((existingAssignment) => existingAssignment.trainerId),
    )

    return staff.filter(
      (profile) =>
        hasStaffTitle(profile.titles, 'Trainer') && !unavailableTrainerIds.has(profile.id),
    )
  }, [allAssignmentsQuery.data, canAssignTrainer, staff])

  const handleAssignmentSaved = async (nextAssignment: TrainerClient, mode: 'create' | 'edit') => {
    await invalidatePtQueries(queryClient, memberId, nextAssignment.id, [
      assignment?.trainerId,
      nextAssignment.trainerId,
    ])

    if (mode === 'create') {
      setPendingGenerateAssignment(nextAssignment)
    }
  }

  const handleRemoveAssignment = async (cancelFutureSessions: boolean) => {
    if (!assignment) {
      return
    }

    setRemovalAction(cancelFutureSessions ? 'cancel-future' : 'keep')

    try {
      const result = await deletePtAssignment(assignment.id, {
        cancelFutureSessions,
      })
      setShowRemoveDialog(false)
      await invalidatePtQueries(queryClient, memberId, assignment.id, [assignment.trainerId])
      toast({
        title: 'Assignment removed',
        description: cancelFutureSessions
          ? `The trainer assignment was marked inactive and ${result.cancelledSessions} future session${result.cancelledSessions === 1 ? '' : 's'} were cancelled.`
          : 'The trainer assignment was marked inactive. Existing sessions were left unchanged.',
      })
    } catch (error) {
      toast({
        title: 'Unable to remove assignment',
        description:
          error instanceof Error ? error.message : 'Failed to update this trainer assignment.',
        variant: 'destructive',
      })
    } finally {
      setRemovalAction(null)
    }
  }

  const handleGenerateCurrentMonth = async () => {
    if (!pendingGenerateAssignment || !currentMonth) {
      setPendingGenerateAssignment(null)
      return
    }

    setIsGenerating(true)

    try {
      const result = await generatePtAssignmentSessions(pendingGenerateAssignment.id, {
        month: currentMonth.month,
        year: currentMonth.year,
      })

      if (!result.ok) {
        toast({
          title: 'Generation needs override',
          description: `Some weeks would exceed the ${MAX_PT_SESSIONS_PER_WEEK}-session limit (${result.weeks.join(', ')}). Use the Schedule page to override if needed.`,
          variant: 'destructive',
        })
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.ptScheduling.sessions({}),
          exact: false,
        })
        toast({
          title: 'Sessions generated',
          description: `${result.generated} session${result.generated === 1 ? '' : 's'} generated and ${result.skipped} skipped for ${getMonthLabel(currentMonth.month, currentMonth.year)}.`,
        })
      }
    } catch (error) {
      toast({
        title: 'Session generation failed',
        description:
          error instanceof Error ? error.message : 'Failed to generate the current month sessions.',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
      setPendingGenerateAssignment(null)
    }
  }

  if (isLoading || allAssignmentsQuery.isLoading || (canAssignTrainer && isStaffLoading)) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Personal Trainer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Personal Trainer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : 'Failed to load the PT assignment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Personal Trainer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignment ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Trainer</p>
                    <Link
                      href={`/staff/${assignment.trainerId}`}
                      className="font-medium hover:underline block"
                    >
                      {assignment.trainerName ?? 'Unknown trainer'}
                    </Link>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(assignment.trainerTitles ?? []).map((title) => (
                        <Badge key={title} variant="outline">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {!isFrontDesk ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-sm">PT Fee</p>
                      <p className="font-medium">{formatJmdCurrency(assignment.ptFee)}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Schedule</p>
                    <p className="font-medium">
                      {formatScheduleSummary(assignment.scheduledSessions, assignment.sessionsPerWeek)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Training Plan</p>
                    {normalizeTrainingPlan(assignment.trainingPlan).length > 0 ? (
                      <ul className="space-y-1 font-medium">
                        {normalizeTrainingPlan(assignment.trainingPlan).map((entry) => (
                          <li key={entry.day}>
                            {entry.day} &rarr; {entry.trainingTypeName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-medium">Not set</p>
                    )}
                  </div>
                </div>

                {assignment.notes ? (
                  <div className="space-y-1 sm:col-span-2 pt-2">
                    <p className="text-muted-foreground text-sm">Notes</p>
                    <p className="whitespace-pre-wrap font-medium">{assignment.notes}</p>
                  </div>
                ) : null}
              </div>

              {canAssignTrainer ? (
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setShowAssignmentDialog(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit Assignment
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRemoveDialog(true)}
                    disabled={isRemoving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Assignment
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">No trainer assigned</p>
                <p className="text-muted-foreground text-sm">
                  {canAssignTrainer
                    ? 'Assign a trainer to configure recurring PT sessions for this member.'
                    : 'Trainer assignments are managed by administrators.'}
                </p>
              </div>
              {canAssignTrainer ? (
                <Button onClick={() => setShowAssignmentDialog(true)}>
                  <UserRoundPlus className="h-4 w-4" />
                  Assign Trainer
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {canAssignTrainer ? (
        <>
          <PtAssignmentDialog
            open={showAssignmentDialog}
            onOpenChange={setShowAssignmentDialog}
            mode={assignment ? 'edit' : 'create'}
            memberId={memberId}
            assignment={assignment}
            trainers={availableTrainers}
            onSaved={handleAssignmentSaved}
          />

          <Dialog
            open={showRemoveDialog}
            onOpenChange={(open) => {
              setShowRemoveDialog(open)

              if (!open) {
                setRemovalAction(null)
              }
            }}
          >
            <DialogContent className="sm:max-w-[560px]" isLoading={isRemoving}>
              <DialogHeader>
                <DialogTitle>Remove trainer assignment?</DialogTitle>
                <DialogDescription>
                  Choose whether to keep the member&apos;s existing PT sessions or cancel all future scheduled sessions when the assignment is marked inactive.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRemoveAssignment(false)}
                  disabled={isRemoving}
                  loading={removalAction === 'keep'}
                >
                  Keep existing sessions
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleRemoveAssignment(true)}
                  disabled={isRemoving}
                  loading={removalAction === 'cancel-future'}
                >
                  Remove assignment and cancel all future sessions
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowRemoveDialog(false)}
                  disabled={isRemoving}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={Boolean(pendingGenerateAssignment)}
            onOpenChange={(open) => {
              if (!open) {
                setPendingGenerateAssignment(null)
              }
            }}
            title="Generate sessions now?"
            description={
              currentMonth
                ? `Would you like to generate sessions for ${getMonthLabel(currentMonth.month, currentMonth.year)}?`
                : 'Would you like to generate sessions for the current month?'
            }
            confirmLabel="Yes, Generate"
            cancelLabel="No"
            onConfirm={() => void handleGenerateCurrentMonth()}
            onCancel={() => setPendingGenerateAssignment(null)}
            isLoading={isGenerating}
          />
        </>
      ) : null}
    </>
  )
}
