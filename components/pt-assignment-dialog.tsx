'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import {
  PtAssignmentScheduleEditor,
  buildAssignmentScheduleFormState,
  getAssignmentScheduleFormPayload,
  normalizeAssignmentScheduleForm,
  validateAssignmentScheduleForm,
  type AssignmentScheduleFormState,
} from '@/components/pt-assignment-schedule-editor'
import { SearchableSelect } from '@/components/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  createPtAssignment,
  DEFAULT_PT_SESSION_TIME,
  updatePtAssignment,
  type TrainerClient,
} from '@/lib/pt-scheduling'
import type { Profile } from '@/types'

type TrainerOption = Pick<Profile, 'id' | 'name' | 'titles'>

type PtAssignmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  memberId: string
  assignment?: TrainerClient | null
  trainers: TrainerOption[]
  inactiveAssignmentsByTrainerId?: Readonly<Record<string, TrainerClient>>
  onSaved?: (assignment: TrainerClient, mode: 'create' | 'edit') => void | Promise<void>
}

type FormState = {
  trainerId: string
  ptFee: string
  notes: string
} & AssignmentScheduleFormState

function createInitialFormState(assignment?: TrainerClient | null): FormState {
  return {
    trainerId: assignment?.trainerId ?? '',
    ...buildAssignmentScheduleFormState(assignment),
    ptFee: assignment ? (assignment.ptFee === null ? '' : String(assignment.ptFee)) : '',
    notes: assignment?.notes ?? '',
  }
}

function normalizeFormState(formState: FormState) {
  const scheduleForm = normalizeAssignmentScheduleForm(formState)

  return {
    trainerId: formState.trainerId,
    ...scheduleForm,
    ptFee: formState.ptFee.trim(),
    notes: formState.notes.trim(),
  }
}

export function PtAssignmentDialog({
  open,
  onOpenChange,
  mode,
  memberId,
  assignment = null,
  trainers,
  inactiveAssignmentsByTrainerId = {},
  onSaved,
}: PtAssignmentDialogProps) {
  const defaultSessionTime = assignment?.sessionTime ?? DEFAULT_PT_SESSION_TIME
  const initialFormState = useMemo(() => createInitialFormState(assignment), [assignment])
  const [formData, setFormData] = useState<FormState>(initialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const hasChanges = useMemo(
    () =>
      JSON.stringify(normalizeFormState(formData)) !==
      JSON.stringify(normalizeFormState(initialFormState)),
    [formData, initialFormState],
  )
  const selectedTrainer = useMemo(
    () => trainers.find((trainer) => trainer.id === formData.trainerId) ?? null,
    [formData.trainerId, trainers],
  )
  const scheduleValidation = useMemo(() => validateAssignmentScheduleForm(formData), [formData])
  const hasScheduledSessionErrors = Object.keys(scheduleValidation.scheduledSessionErrors).length > 0
  const hasTrainingPlanErrors = Object.keys(scheduleValidation.trainingPlanErrors).length > 0
  const hasScheduleValidationErrors =
    Boolean(scheduleValidation.scheduledDaysError) ||
    hasScheduledSessionErrors ||
    hasTrainingPlanErrors

  useEffect(() => {
    setFormData(initialFormState)
    setIsSubmitting(false)
    setShowValidationErrors(false)
  }, [initialFormState, open])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(initialFormState)
      setIsSubmitting(false)
      setShowValidationErrors(false)
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShowValidationErrors(true)

    if (mode === 'create' && !formData.trainerId) {
      toast({
        title: 'Trainer required',
        description: 'Select a trainer before saving this assignment.',
        variant: 'destructive',
      })
      return
    }

    if (hasScheduledSessionErrors) {
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

    if (hasTrainingPlanErrors) {
      return
    }

    const normalizedPtFee = formData.ptFee.trim()
    let ptFee: number | null = null
    const scheduleFormPayload = getAssignmentScheduleFormPayload(formData)

    if (normalizedPtFee !== '') {
      const parsedPtFee = Number(normalizedPtFee)

      if (!Number.isInteger(parsedPtFee) || parsedPtFee < 0) {
        toast({
          title: 'Invalid PT fee',
          description: 'Enter a whole-number PT fee in JMD.',
          variant: 'destructive',
        })
        return
      }

      ptFee = parsedPtFee
    }

    setIsSubmitting(true)

    try {
      const assignmentPayload = {
        ptFee,
        sessionsPerWeek: scheduleFormPayload.sessionsPerWeek,
        scheduledSessions: scheduleFormPayload.scheduledSessions,
        trainingPlan: scheduleFormPayload.trainingPlan,
        notes: formData.notes.trim() || null,
      }
      const inactiveAssignment =
        mode === 'create' ? inactiveAssignmentsByTrainerId[formData.trainerId] ?? null : null
      const nextAssignment =
        mode === 'create'
          ? inactiveAssignment
            ? await updatePtAssignment(inactiveAssignment.id, {
                status: 'active',
                ...assignmentPayload,
              })
            : await createPtAssignment({
                trainerId: formData.trainerId,
                memberId,
                ...assignmentPayload,
              })
          : await updatePtAssignment(assignment?.id ?? '', assignmentPayload)

      handleOpenChange(false)
      await onSaved?.(nextAssignment, mode)
      toast({
        title: mode === 'create' ? 'Trainer assigned' : 'Assignment updated',
        description:
          mode === 'create'
            ? `${nextAssignment.trainerName ?? selectedTrainer?.name ?? 'Trainer'} was assigned successfully.`
            : 'The PT assignment was updated successfully.',
      })
    } catch (error) {
      toast({
        title: mode === 'create' ? 'Assignment failed' : 'Update failed',
        description:
          error instanceof Error
            ? error.message
            : mode === 'create'
              ? 'Failed to create the PT assignment.'
              : 'Failed to update the PT assignment.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] p-0"
        isLoading={isSubmitting}
      >
        <div className="max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Assign Trainer' : 'Edit Assignment'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Create a new personal training assignment for this member.'
                : 'Update the trainer schedule, pricing, and notes for this member.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-pt-trainer`}>Trainer</Label>
              {mode === 'create' ? (
                <SearchableSelect
                  value={formData.trainerId || null}
                  onValueChange={(trainerId) =>
                    setFormData((current) => ({
                      ...current,
                      trainerId,
                    }))
                  }
                  options={trainers.map((trainer) => ({
                    value: trainer.id,
                    label: trainer.name,
                    description: trainer.titles.join(', '),
                    keywords: trainer.titles,
                  }))}
                  placeholder={trainers.length > 0 ? 'Select a trainer' : 'No trainers available'}
                  searchPlaceholder="Search trainers..."
                  emptyMessage="No matching trainers found."
                  disabled={trainers.length === 0 || isSubmitting}
                />
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="font-medium">{assignment?.trainerName ?? selectedTrainer?.name ?? 'Trainer'}</div>
                  <div className="flex flex-wrap gap-2">
                    {(assignment?.trainerTitles ?? selectedTrainer?.titles ?? []).map((title) => (
                      <Badge key={title} variant="outline">
                        {title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <PtAssignmentScheduleEditor
              formState={formData}
              defaultSessionTime={defaultSessionTime}
              isSubmitting={isSubmitting}
              showValidationErrors={showValidationErrors}
              onFormStateChange={(nextScheduleFormState) =>
                setFormData((current) => ({
                  ...current,
                  ...nextScheduleFormState,
                }))
              }
            />

          <div className="space-y-2">
            <Label htmlFor={`${mode}-pt-fee`}>PT Fee (JMD)</Label>
            <Input
              id={`${mode}-pt-fee`}
              type="number"
              min={0}
              step={1}
              value={formData.ptFee}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  ptFee: event.target.value,
                }))
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${mode}-pt-notes`}>Notes</Label>
            <Textarea
              id={`${mode}-pt-notes`}
              value={formData.notes}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="e.g. client injuries, physical limitations, special instructions"
              disabled={isSubmitting}
              rows={4}
            />
          </div>

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
                isSubmitting ||
                hasScheduleValidationErrors ||
                (mode === 'edit' && !hasChanges) ||
                (mode === 'create' && trainers.length === 0)
              }
              loading={isSubmitting}
            >
              {isSubmitting ? (
                mode === 'create' ? 'Assigning...' : 'Saving...'
              ) : mode === 'create' ? (
                <>
                  <Plus data-icon="inline-start" className="h-4 w-4" />
                  Assign Trainer
                </>
              ) : (
                <>
                  <Pencil data-icon="inline-start" className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
