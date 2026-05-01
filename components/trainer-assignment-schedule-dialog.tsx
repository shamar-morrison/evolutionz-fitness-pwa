'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PtAssignmentScheduleEditor,
  buildAssignmentScheduleFormState,
  getAssignmentScheduleFormPayload,
  normalizeAssignmentScheduleForm,
  validateAssignmentScheduleForm,
  type AssignmentScheduleFormState,
} from '@/components/pt-assignment-schedule-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import {
  DEFAULT_PT_SESSION_TIME,
  fetchPtAssignmentSchedule,
  updatePtAssignmentSchedule,
  type TrainerClient,
} from '@/lib/pt-scheduling'

type TrainerAssignmentScheduleDialogProps = {
  assignmentId: string | null
  memberName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (assignment: TrainerClient) => void | Promise<void>
}

function resetScheduleFormState(): AssignmentScheduleFormState {
  return buildAssignmentScheduleFormState(null)
}

export function TrainerAssignmentScheduleDialog({
  assignmentId,
  memberName,
  open,
  onOpenChange,
  onSaved,
}: TrainerAssignmentScheduleDialogProps) {
  const [assignment, setAssignment] = useState<TrainerClient | null>(null)
  const [formData, setFormData] = useState<AssignmentScheduleFormState>(resetScheduleFormState)
  const [isLoadingAssignment, setIsLoadingAssignment] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const defaultSessionTime = assignment?.sessionTime ?? DEFAULT_PT_SESSION_TIME
  const initialFormState = useMemo(
    () => buildAssignmentScheduleFormState(assignment),
    [assignment],
  )
  const scheduleValidation = useMemo(() => validateAssignmentScheduleForm(formData), [formData])
  const hasChanges = useMemo(
    () =>
      JSON.stringify(normalizeAssignmentScheduleForm(formData)) !==
      JSON.stringify(normalizeAssignmentScheduleForm(initialFormState)),
    [formData, initialFormState],
  )

  useEffect(() => {
    if (!open || !assignmentId) {
      return
    }

    let cancelled = false

    setAssignment(null)
    setFormData(resetScheduleFormState())
    setLoadError(null)
    setShowValidationErrors(false)
    setIsLoadingAssignment(true)

    void fetchPtAssignmentSchedule(assignmentId)
      .then((nextAssignment) => {
        if (cancelled) {
          return
        }

        setAssignment(nextAssignment)
        setFormData(buildAssignmentScheduleFormState(nextAssignment))
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load the assignment schedule.',
        )
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAssignment(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [assignmentId, open])

  const resetDialogState = () => {
    setAssignment(null)
    setFormData(resetScheduleFormState())
    setIsLoadingAssignment(false)
    setIsSubmitting(false)
    setLoadError(null)
    setShowValidationErrors(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetDialogState()
    }

    onOpenChange(nextOpen)
  }

  const handleRetryLoad = () => {
    if (!assignmentId) {
      return
    }

    setLoadError(null)
    setAssignment(null)
    setFormData(resetScheduleFormState())
    setIsLoadingAssignment(true)

    void fetchPtAssignmentSchedule(assignmentId)
      .then((nextAssignment) => {
        setAssignment(nextAssignment)
        setFormData(buildAssignmentScheduleFormState(nextAssignment))
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load the assignment schedule.',
        )
      })
      .finally(() => {
        setIsLoadingAssignment(false)
      })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShowValidationErrors(true)

    if (!assignmentId || !assignment) {
      return
    }

    if (Object.keys(scheduleValidation.scheduledSessionErrors).length > 0) {
      toast({
        title: 'Invalid session time',
        description: 'Choose a valid HH:MM time for each selected day.',
        variant: 'destructive',
      })
      return
    }

    if (scheduleValidation.scheduledDaysError) {
      return
    }

    if (Object.keys(scheduleValidation.trainingPlanErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const nextAssignment = await updatePtAssignmentSchedule(
        assignmentId,
        getAssignmentScheduleFormPayload(formData),
      )

      setAssignment(nextAssignment)
      handleOpenChange(false)
      await onSaved?.(nextAssignment)
      toast({
        title: 'Schedule updated',
        description: 'The client schedule was updated successfully.',
      })
    } catch (error) {
      toast({
        title: 'Update failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to update the client schedule.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0" isLoading={isLoadingAssignment || isSubmitting}>
        <div className="max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Update the recurring training plan days and session times for {memberName}.
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <div className="space-y-4 pt-4">
              <p className="text-sm text-destructive">{loadError}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
                <Button type="button" onClick={handleRetryLoad}>
                  Retry
                </Button>
              </DialogFooter>
            </div>
          ) : assignment ? (
            <form onSubmit={handleSubmit} className="space-y-5 pt-4">
              <PtAssignmentScheduleEditor
                formState={formData}
                defaultSessionTime={defaultSessionTime}
                isSubmitting={isSubmitting}
                showValidationErrors={showValidationErrors}
                onFormStateChange={setFormData}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isLoadingAssignment ||
                    isSubmitting ||
                    Boolean(scheduleValidation.scheduledDaysError) ||
                    !hasChanges
                  }
                  loading={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="py-8 text-sm text-muted-foreground">Loading schedule...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
