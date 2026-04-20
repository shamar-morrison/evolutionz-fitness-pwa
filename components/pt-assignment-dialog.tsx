'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  createPtAssignment,
  DEFAULT_PT_SESSIONS_PER_WEEK,
  DEFAULT_PT_SESSION_TIME,
  DAYS_OF_WEEK,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeAssignmentTrainingPlan,
  normalizeScheduledDays,
  normalizeSessionTimeValue,
  PREDEFINED_TRAINING_TYPES,
  updatePtAssignment,
  type DayOfWeek,
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
  onSaved?: (assignment: TrainerClient, mode: 'create' | 'edit') => void | Promise<void>
}

type ScheduleFormEntry = {
  mode: 'predefined' | 'custom'
  trainingTypeName: string
  sessionTime: string
}

type FormState = {
  trainerId: string
  sessionsPerWeek: number
  scheduledDays: DayOfWeek[]
  scheduleByDay: Partial<Record<DayOfWeek, ScheduleFormEntry>>
  ptFee: string
  notes: string
}

const TRAINING_TYPE_UNSELECTED_VALUE = '__unset__'
const TRAINING_TYPE_CUSTOM_VALUE = '__custom__'

function buildScheduleState(
  assignment?: TrainerClient | null,
): FormState['scheduleByDay'] {
  const scheduleByDay: FormState['scheduleByDay'] = {}
  const scheduledSessions =
    assignment?.scheduledSessions.length
      ? assignment.scheduledSessions
      : normalizeScheduledDays(assignment?.scheduledDays ?? []).map((day) => {
          const trainingPlanEntry = assignment?.trainingPlan.find((entry) => entry.day === day)

          return {
            day,
            sessionTime: assignment?.sessionTime ?? DEFAULT_PT_SESSION_TIME,
            trainingTypeName: trainingPlanEntry?.trainingTypeName ?? null,
            isCustom: trainingPlanEntry?.isCustom ?? false,
          }
        })

  for (const entry of scheduledSessions) {
    scheduleByDay[entry.day] = {
      mode: entry.isCustom ? 'custom' : 'predefined',
      trainingTypeName: entry.trainingTypeName ?? '',
      sessionTime: entry.sessionTime,
    }
  }

  return scheduleByDay
}

function syncScheduleState(
  scheduledDays: DayOfWeek[],
  scheduleByDay: FormState['scheduleByDay'],
  defaultSessionTime: string,
) {
  const nextScheduleByDay: FormState['scheduleByDay'] = {}

  for (const day of normalizeScheduledDays(scheduledDays)) {
    nextScheduleByDay[day] = scheduleByDay[day] ?? {
      mode: 'predefined',
      trainingTypeName: '',
      sessionTime: defaultSessionTime,
    }
  }

  return nextScheduleByDay
}

function getScheduledSessionsPayload(formState: FormState) {
  return normalizeScheduledDays(formState.scheduledDays).flatMap((day) => {
    const sessionTime = normalizeSessionTimeValue(formState.scheduleByDay[day]?.sessionTime ?? '')

    return sessionTime
      ? [
          {
            day,
            sessionTime,
          },
        ]
      : []
  })
}

function getTrainingPlanPayload(formState: FormState) {
  return normalizeAssignmentTrainingPlan(
    normalizeScheduledDays(formState.scheduledDays).flatMap((day) => {
      const trainingPlanEntry = formState.scheduleByDay[day]
      const trainingTypeName = trainingPlanEntry?.trainingTypeName.trim() ?? ''

      return trainingTypeName
        ? [
            {
              day,
              trainingTypeName,
            },
          ]
        : []
    }),
  )
}

function getScheduledSessionErrors(formState: FormState) {
  const errors: Partial<Record<DayOfWeek, string>> = {}

  for (const day of normalizeScheduledDays(formState.scheduledDays)) {
    if (!normalizeSessionTimeValue(formState.scheduleByDay[day]?.sessionTime ?? '')) {
      errors[day] = 'Choose a valid session time.'
    }
  }

  return errors
}

function getTrainingPlanErrors(formState: FormState) {
  const errors: Partial<Record<DayOfWeek, string>> = {}

  for (const day of normalizeScheduledDays(formState.scheduledDays)) {
    const trainingPlanEntry = formState.scheduleByDay[day]

    if (trainingPlanEntry?.mode === 'custom' && !trainingPlanEntry.trainingTypeName.trim()) {
      errors[day] = 'Enter a custom training type.'
    }
  }

  return errors
}

function createInitialFormState(assignment?: TrainerClient | null): FormState {
  const scheduledDays = assignment ? normalizeScheduledDays(assignment.scheduledDays) : []

  return {
    trainerId: assignment?.trainerId ?? '',
    sessionsPerWeek: assignment?.sessionsPerWeek ?? DEFAULT_PT_SESSIONS_PER_WEEK,
    scheduledDays,
    scheduleByDay: buildScheduleState(assignment),
    ptFee: assignment ? String(assignment.ptFee) : '',
    notes: assignment?.notes ?? '',
  }
}

function normalizeFormState(formState: FormState) {
  return {
    trainerId: formState.trainerId,
    sessionsPerWeek: formState.sessionsPerWeek,
    scheduledSessions: getScheduledSessionsPayload(formState),
    trainingPlan: getTrainingPlanPayload(formState),
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
  onSaved,
}: PtAssignmentDialogProps) {
  const defaultSessionTime = assignment?.sessionTime ?? DEFAULT_PT_SESSION_TIME
  const initialFormState = useMemo(() => createInitialFormState(assignment), [assignment])
  const [formData, setFormData] = useState<FormState>(initialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const hasChanges = useMemo(
    () => JSON.stringify(normalizeFormState(formData)) !== JSON.stringify(normalizeFormState(initialFormState)),
    [formData, initialFormState],
  )
  const selectedTrainer = useMemo(
    () => trainers.find((trainer) => trainer.id === formData.trainerId) ?? null,
    [formData.trainerId, trainers],
  )
  const scheduledDaysError =
    formData.scheduledDays.length === formData.sessionsPerWeek
      ? null
      : `Select exactly ${formData.sessionsPerWeek} day${formData.sessionsPerWeek === 1 ? '' : 's'}.`
  const scheduledSessionErrors = useMemo(() => getScheduledSessionErrors(formData), [formData])
  const trainingPlanErrors = useMemo(() => getTrainingPlanErrors(formData), [formData])

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

  const handleDayToggle = (day: DayOfWeek) => {
    if (formData.scheduledDays.includes(day)) {
      setFormData((current) => ({
        ...current,
        scheduledDays: current.scheduledDays.filter((value) => value !== day),
        scheduleByDay: syncScheduleState(
          current.scheduledDays.filter((value) => value !== day),
          current.scheduleByDay,
          defaultSessionTime,
        ),
      }))
      return
    }

    if (formData.scheduledDays.length >= formData.sessionsPerWeek) {
      toast({
        title: 'Too many days selected',
        description: `Select exactly ${formData.sessionsPerWeek} day${formData.sessionsPerWeek === 1 ? '' : 's'}.`,
        variant: 'destructive',
      })
      return
    }

    setFormData((current) => ({
      ...current,
      scheduledDays: normalizeScheduledDays([...current.scheduledDays, day]),
      scheduleByDay: syncScheduleState(
        normalizeScheduledDays([...current.scheduledDays, day]),
        current.scheduleByDay,
        defaultSessionTime,
      ),
    }))
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

    if (Object.keys(scheduledSessionErrors).length > 0) {
      toast({
        title: 'Invalid session time',
        description: 'Choose a valid HH:MM time for each selected day.',
        variant: 'destructive',
      })
      return
    }

    if (scheduledDaysError) {
      return
    }

    if (Object.keys(trainingPlanErrors).length > 0) {
      return
    }

    const ptFee = Number(formData.ptFee)

    if (!Number.isInteger(ptFee) || ptFee < 0) {
      toast({
        title: 'Invalid PT fee',
        description: 'Enter a whole-number PT fee in JMD.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const nextAssignment =
        mode === 'create'
          ? await createPtAssignment({
              trainerId: formData.trainerId,
              memberId,
              ptFee,
              sessionsPerWeek: formData.sessionsPerWeek,
              scheduledSessions: getScheduledSessionsPayload(formData),
              trainingPlan: getTrainingPlanPayload(formData),
              notes: formData.notes.trim() || null,
            })
          : await updatePtAssignment(assignment?.id ?? '', {
              ptFee,
              sessionsPerWeek: formData.sessionsPerWeek,
              scheduledSessions: getScheduledSessionsPayload(formData),
              trainingPlan: getTrainingPlanPayload(formData),
              notes: formData.notes.trim() || null,
            })

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

          <div className="space-y-2">
            <Label htmlFor={`${mode}-pt-frequency`}>Sessions per week</Label>
            <Select
              value={String(formData.sessionsPerWeek)}
              onValueChange={(value) =>
                setFormData((current) => {
                  const sessionsPerWeek = Number(value)
                  const scheduledDays = current.scheduledDays.slice(0, sessionsPerWeek)

                  return {
                    ...current,
                    sessionsPerWeek,
                    scheduledDays,
                    scheduleByDay: syncScheduleState(scheduledDays, current.scheduleByDay, defaultSessionTime),
                  }
                })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id={`${mode}-pt-frequency`} aria-label="Sessions per week">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_PT_SESSIONS_PER_WEEK }, (_, index) => {
                  const sessions = index + 1

                  return (
                    <SelectItem key={sessions} value={String(sessions)}>
                      {sessions} session{sessions === 1 ? '' : 's'}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scheduled days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const selected = formData.scheduledDays.includes(day)

                return (
                  <Button
                    key={day}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleDayToggle(day)}
                    disabled={isSubmitting}
                  >
                    {day}
                  </Button>
                )
              })}
            </div>
            <p className={scheduledDaysError ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              Select exactly {formData.sessionsPerWeek} day{formData.sessionsPerWeek === 1 ? '' : 's'}.
            </p>
          </div>

          {formData.scheduledDays.length > 0 ? (
            <div className="space-y-3">
              <Label>Training Schedule</Label>
              <div className="space-y-3 rounded-md border p-4">
                {normalizeScheduledDays(formData.scheduledDays).map((day) => {
                  const scheduleEntry = formData.scheduleByDay[day] ?? {
                    mode: 'predefined' as const,
                    trainingTypeName: '',
                    sessionTime: defaultSessionTime,
                  }
                  const sessionTimeError = showValidationErrors ? scheduledSessionErrors[day] : undefined
                  const trainingPlanError = showValidationErrors ? trainingPlanErrors[day] : undefined

                  return (
                    <div key={day} className="space-y-2">
                      <div className="grid gap-3 sm:grid-cols-[110px_140px_minmax(0,1fr)] sm:items-center">
                        <div className="text-sm font-medium">{day}</div>
                        <Input
                          aria-label={`${day} session time`}
                          type="time"
                          step={60}
                          value={scheduleEntry.sessionTime}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              scheduleByDay: {
                                ...current.scheduleByDay,
                                [day]: {
                                  ...(current.scheduleByDay[day] ?? scheduleEntry),
                                  sessionTime: event.target.value,
                                },
                              },
                            }))
                          }
                          disabled={isSubmitting}
                        />
                        {scheduleEntry.mode === 'custom' ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={scheduleEntry.trainingTypeName}
                              onChange={(event) =>
                                setFormData((current) => ({
                                  ...current,
                                  scheduleByDay: {
                                    ...current.scheduleByDay,
                                    [day]: {
                                      ...(current.scheduleByDay[day] ?? scheduleEntry),
                                      mode: 'custom',
                                      trainingTypeName: event.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Enter custom training type"
                              disabled={isSubmitting}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="px-3"
                              onClick={() =>
                                setFormData((current) => ({
                                  ...current,
                                  scheduleByDay: {
                                    ...current.scheduleByDay,
                                    [day]: {
                                      ...(current.scheduleByDay[day] ?? scheduleEntry),
                                      mode: 'predefined',
                                      trainingTypeName: '',
                                    },
                                  },
                                }))
                              }
                              disabled={isSubmitting}
                              aria-label={`Use predefined training types for ${day}`}
                            >
                              &times;
                            </Button>
                          </div>
                        ) : (
                          <Select
                            value={scheduleEntry.trainingTypeName || TRAINING_TYPE_UNSELECTED_VALUE}
                            onValueChange={(value) =>
                              setFormData((current) => ({
                                ...current,
                                scheduleByDay: {
                                  ...current.scheduleByDay,
                                  [day]:
                                    value === TRAINING_TYPE_CUSTOM_VALUE
                                      ? {
                                          ...(current.scheduleByDay[day] ?? scheduleEntry),
                                          mode: 'custom',
                                          trainingTypeName: '',
                                        }
                                      : {
                                          ...(current.scheduleByDay[day] ?? scheduleEntry),
                                          mode: 'predefined',
                                          trainingTypeName:
                                            value === TRAINING_TYPE_UNSELECTED_VALUE ? '' : value,
                                        },
                                },
                              }))
                            }
                            disabled={isSubmitting}
                          >
                            <SelectTrigger aria-label={`${day} training type`}>
                              <SelectValue placeholder="Select training type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={TRAINING_TYPE_UNSELECTED_VALUE}>
                                Select training type
                              </SelectItem>
                              {PREDEFINED_TRAINING_TYPES.map((trainingType) => (
                                <SelectItem key={trainingType} value={trainingType}>
                                  {trainingType}
                                </SelectItem>
                              ))}
                              <SelectItem value={TRAINING_TYPE_CUSTOM_VALUE}>Other (custom)</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      {sessionTimeError ? <p className="text-destructive text-xs">{sessionTimeError}</p> : null}
                      {trainingPlanError ? (
                        <p className="text-destructive text-xs">{trainingPlanError}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

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
              required
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
                Boolean(scheduledDaysError) ||
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
