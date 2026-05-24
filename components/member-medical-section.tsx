'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardList, UserRoundPlus } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SearchableSelect } from '@/components/searchable-select'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useMedicalAssignments } from '@/hooks/use-medical'
import { useStaff } from '@/hooks/use-staff'
import { toast } from '@/hooks/use-toast'
import {
  completeMedicalAssignment,
  createMedicalAssignment,
  formatMedicalDate,
  formatMedicalDateFromTimestamp,
} from '@/lib/medical'
import { queryKeys } from '@/lib/query-keys'
import { formatStaffTitles, hasStaffTitle } from '@/lib/staff'

type MemberMedicalSectionProps = {
  memberId: string
}

async function invalidateMedicalQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  assignmentId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.medical.all, exact: false }),
    assignmentId
      ? queryClient.invalidateQueries({ queryKey: queryKeys.medical.assignment(assignmentId) })
      : Promise.resolve(),
  ])
}

export function MemberMedicalSection({ memberId }: MemberMedicalSectionProps) {
  const queryClient = useQueryClient()
  const {
    data: assignments = [],
    isLoading: isAssignmentsLoading,
    error: assignmentsError,
  } = useMedicalAssignments({
    memberId,
    status: 'active',
  })
  const { staff, isLoading: isStaffLoading } = useStaff()
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [followUpDate, setFollowUpDate] = useState('')
  const [assignmentToClose, setAssignmentToClose] = useState<{
    id: string
    staffName: string
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const activeStaffIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.staffId)),
    [assignments],
  )
  const medicalStaffOptions = useMemo(
    () =>
      staff
        .filter(
          (profile) =>
            hasStaffTitle(profile.titles, 'Medical/Consultant') &&
            !profile.archivedAt &&
            !activeStaffIds.has(profile.id),
        )
        .map((profile) => ({
          value: profile.id,
          label: profile.name,
          description: formatStaffTitles(profile.titles) || 'Medical/Consultant',
          keywords: profile.titles,
        })),
    [activeStaffIds, staff],
  )

  const resetAssignDialog = () => {
    setSelectedStaffId(null)
    setFollowUpDate('')
    setIsSubmitting(false)
    setShowAssignDialog(false)
  }

  const handleCreateAssignment = async () => {
    if (!selectedStaffId) {
      toast({
        title: 'Medical staff required',
        description: 'Select a medical/consultant staff member before assigning.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const assignment = await createMedicalAssignment({
        memberId,
        staffId: selectedStaffId,
        followUpDate: followUpDate || null,
      })
      await invalidateMedicalQueries(queryClient, assignment.id)
      resetAssignDialog()
      toast({
        title: 'Assignment created',
        description: `${assignment.staffName} was assigned successfully.`,
      })
    } catch (error) {
      toast({
        title: 'Unable to assign medical staff',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to create the medical assignment.',
        variant: 'destructive',
      })
      setIsSubmitting(false)
    }
  }

  const handleCloseAssignment = async () => {
    if (!assignmentToClose) {
      return
    }

    setIsSubmitting(true)

    try {
      const assignment = await completeMedicalAssignment(assignmentToClose.id)
      await invalidateMedicalQueries(queryClient, assignment.id)
      setAssignmentToClose(null)
      toast({
        title: 'Assignment closed',
        description: `${assignment.staffName}'s assignment was marked as completed.`,
      })
    } catch (error) {
      toast({
        title: 'Unable to close assignment',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to close this medical assignment.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAssignmentsLoading || isStaffLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Medical/Consultant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    )
  }

  if (assignmentsError) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Medical/Consultant</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">
            {assignmentsError instanceof Error
              ? assignmentsError.message
              : 'Failed to load medical assignments.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Medical/Consultant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignments.length === 0 ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">No active medical assignments</p>
                <p className="text-muted-foreground text-sm">
                  Assign a medical/consultant staff member for visit-based follow-up.
                </p>
              </div>
              <Button onClick={() => setShowAssignDialog(true)}>
                <UserRoundPlus className="h-4 w-4" />
                Assign to Medical Staff
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{assignment.staffName}</p>
                      <p className="text-muted-foreground text-sm">
                        Assigned {formatMedicalDateFromTimestamp(assignment.createdAt)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Follow-up:{' '}
                        {assignment.followUpDate
                          ? formatMedicalDate(assignment.followUpDate)
                          : 'Not set'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() =>
                        setAssignmentToClose({
                          id: assignment.id,
                          staffName: assignment.staffName,
                        })
                      }
                    >
                      Close Assignment
                    </Button>
                  </div>
                ))}
              </div>

              <Button onClick={() => setShowAssignDialog(true)}>
                <UserRoundPlus className="h-4 w-4" />
                Assign to Medical Staff
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showAssignDialog}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            resetAssignDialog()
            return
          }

          setShowAssignDialog(open)
        }}
      >
        <DialogContent className="sm:max-w-[520px]" isLoading={isSubmitting}>
          <DialogHeader>
            <DialogTitle>Assign to Medical Staff</DialogTitle>
            <DialogDescription>
              Choose a Medical/Consultant staff member and optionally set a follow-up date.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Medical/Consultant Staff</Label>
              <SearchableSelect
                value={selectedStaffId}
                onValueChange={setSelectedStaffId}
                options={medicalStaffOptions}
                placeholder="Select a staff member"
                searchPlaceholder="Search staff"
                emptyMessage="No medical staff available."
                disabled={isSubmitting || medicalStaffOptions.length === 0}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="medical-follow-up-date">Follow-up Date</Label>
              <Input
                id="medical-follow-up-date"
                type="date"
                value={followUpDate}
                onChange={(event) => setFollowUpDate(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetAssignDialog}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateAssignment()}
              disabled={isSubmitting || !selectedStaffId}
              loading={isSubmitting}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={assignmentToClose !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssignmentToClose(null)
          }
        }}
        title="Close medical assignment?"
        description={
          assignmentToClose
            ? `This will mark ${assignmentToClose.staffName}'s assignment as completed.`
            : 'This assignment will be marked as completed.'
        }
        confirmLabel="Close Assignment"
        cancelLabel="Cancel"
        onConfirm={() => void handleCloseAssignment()}
        onCancel={() => setAssignmentToClose(null)}
        variant="destructive"
        isLoading={isSubmitting}
      />
    </>
  )
}
