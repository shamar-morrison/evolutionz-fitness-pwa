'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Trash2, UserRoundPlus } from 'lucide-react'
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
  parseMonthValue,
  type TrainerClient,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { hasStaffTitle } from '@/lib/staff'

type MemberPtSectionProps = {
  memberId: string
}

async function invalidatePtQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  memberId: string,
  trainerId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.assignments }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.memberAssignment(memberId) }),
    trainerId
      ? queryClient.invalidateQueries({
          queryKey: queryKeys.ptScheduling.trainerAssignments(trainerId),
        })
      : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.sessions({}) }),
  ])
}

export function MemberPtSection({ memberId }: MemberPtSectionProps) {
  const queryClient = useQueryClient()
  const currentMonthValue = getMonthValueInJamaica()
  const currentMonth = parseMonthValue(currentMonthValue)
  const { assignment, isLoading, error } = useMemberPtAssignment(memberId)
  const allAssignmentsQuery = usePtAssignments({ memberId })
  const { staff, isLoading: isStaffLoading } = useStaff()
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [pendingGenerateAssignment, setPendingGenerateAssignment] = useState<TrainerClient | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const availableTrainers = useMemo(() => {
    const unavailableTrainerIds = new Set(
      (allAssignmentsQuery.data ?? []).map((existingAssignment) => existingAssignment.trainerId),
    )

    return staff.filter(
      (profile) =>
        hasStaffTitle(profile.titles, 'Trainer') && !unavailableTrainerIds.has(profile.id),
    )
  }, [allAssignmentsQuery.data, staff])

  const handleAssignmentSaved = async (nextAssignment: TrainerClient, mode: 'create' | 'edit') => {
    await invalidatePtQueries(queryClient, memberId, nextAssignment.trainerId)

    if (mode === 'create') {
      setPendingGenerateAssignment(nextAssignment)
    }
  }

  const handleRemoveAssignment = async (cancelFutureSessions: boolean) => {
    if (!assignment) {
      return
    }

    setIsRemoving(true)

    try {
      const result = await deletePtAssignment(assignment.id, {
        cancelFutureSessions,
      })
      setShowRemoveDialog(false)
      await invalidatePtQueries(queryClient, memberId, assignment.trainerId)
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
      setIsRemoving(false)
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
          description: `Some weeks would exceed the 3-session limit (${result.weeks.join(', ')}). Use the Schedule page to override if needed.`,
          variant: 'destructive',
        })
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKeys.ptScheduling.sessions({}) })
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

  if (isLoading || isStaffLoading || allAssignmentsQuery.isLoading) {
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Trainer</p>
                  <p className="font-medium">{assignment.trainerName ?? 'Unknown trainer'}</p>
                  <div className="flex flex-wrap gap-2">
                    {(assignment.trainerTitles ?? []).map((title) => (
                      <Badge key={title} variant="outline">
                        {title}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Schedule</p>
                  <p className="font-medium">
                    {formatScheduleSummary(
                      assignment.scheduledDays,
                      assignment.sessionTime,
                      assignment.sessionsPerWeek,
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">PT Fee</p>
                  <p className="font-medium">{formatJmdCurrency(assignment.ptFee)}</p>
                </div>
                {assignment.notes ? (
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-muted-foreground text-sm">Notes</p>
                    <p className="whitespace-pre-wrap font-medium">{assignment.notes}</p>
                  </div>
                ) : null}
              </div>

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
            </>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">No trainer assigned</p>
                <p className="text-muted-foreground text-sm">
                  Assign a trainer to configure recurring PT sessions for this member.
                </p>
              </div>
              <Button onClick={() => setShowAssignmentDialog(true)}>
                <UserRoundPlus className="h-4 w-4" />
                Assign Trainer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PtAssignmentDialog
        open={showAssignmentDialog}
        onOpenChange={setShowAssignmentDialog}
        mode={assignment ? 'edit' : 'create'}
        memberId={memberId}
        assignment={assignment}
        trainers={availableTrainers}
        onSaved={handleAssignmentSaved}
      />

      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-[560px]">
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
            >
              Keep existing sessions
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemoveAssignment(true)}
              disabled={isRemoving}
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
  )
}
