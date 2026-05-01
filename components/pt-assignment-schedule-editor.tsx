'use client'

import { toast } from '@/hooks/use-toast'
import {
  DEFAULT_PT_SESSIONS_PER_WEEK,
  DEFAULT_PT_SESSION_TIME,
  DAYS_OF_WEEK,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeAssignmentTrainingPlan,
  normalizeScheduledDays,
  normalizeSessionTimeValue,
  PREDEFINED_TRAINING_TYPES,
  type AssignmentTrainingPlanInput,
  type DayOfWeek,
  type ScheduledSessionInput,
  type TrainerClient,
} from '@/lib/pt-scheduling'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type ScheduleFormEntry = {
  mode: 'predefined' | 'custom'
  trainingTypeName: string
  sessionTime: string
}

export type AssignmentScheduleFormState = {
  sessionsPerWeek: number
  scheduledDays: DayOfWeek[]
  scheduleByDay: Partial<Record<DayOfWeek, ScheduleFormEntry>>
}

export type AssignmentScheduleFormPayload = {
  sessionsPerWeek: number
  scheduledSessions: ScheduledSessionInput[]
  trainingPlan: AssignmentTrainingPlanInput[]
}

export type AssignmentScheduleFormValidation = {
  scheduledDaysError: string | null
  scheduledSessionErrors: Partial<Record<DayOfWeek, string>>
  trainingPlanErrors: Partial<Record<DayOfWeek, string>>
}

type PtAssignmentScheduleEditorProps = {
  formState: AssignmentScheduleFormState
  defaultSessionTime?: string
  isSubmitting: boolean
  showValidationErrors: boolean
  onFormStateChange: (nextFormState: AssignmentScheduleFormState) => void
}

const TRAINING_TYPE_UNSELECTED_VALUE = '__unset__'
const TRAINING_TYPE_CUSTOM_VALUE = '__custom__'

function buildScheduleState(
  assignment?: TrainerClient | null,
): AssignmentScheduleFormState['scheduleByDay'] {
  const scheduleByDay: AssignmentScheduleFormState['scheduleByDay'] = {}
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
  scheduleByDay: AssignmentScheduleFormState['scheduleByDay'],
  defaultSessionTime: string,
) {
  const nextScheduleByDay: AssignmentScheduleFormState['scheduleByDay'] = {}

  for (const day of normalizeScheduledDays(scheduledDays)) {
    nextScheduleByDay[day] = scheduleByDay[day] ?? {
      mode: 'predefined',
      trainingTypeName: '',
      sessionTime: defaultSessionTime,
    }
  }

  return nextScheduleByDay
}

function getScheduledSessionErrors(formState: AssignmentScheduleFormState) {
  const errors: Partial<Record<DayOfWeek, string>> = {}

  for (const day of normalizeScheduledDays(formState.scheduledDays)) {
    if (!normalizeSessionTimeValue(formState.scheduleByDay[day]?.sessionTime ?? '')) {
      errors[day] = 'Choose a valid session time.'
    }
  }

  return errors
}

function getTrainingPlanErrors(formState: AssignmentScheduleFormState) {
  const errors: Partial<Record<DayOfWeek, string>> = {}

  for (const day of normalizeScheduledDays(formState.scheduledDays)) {
    const trainingPlanEntry = formState.scheduleByDay[day]

    if (trainingPlanEntry?.mode === 'custom' && !trainingPlanEntry.trainingTypeName.trim()) {
      errors[day] = 'Enter a custom training type.'
    }
  }

  return errors
}

export function buildAssignmentScheduleFormState(
  assignment?: TrainerClient | null,
): AssignmentScheduleFormState {
  const scheduledDays = assignment ? normalizeScheduledDays(assignment.scheduledDays) : []

  return {
    sessionsPerWeek: assignment?.sessionsPerWeek ?? DEFAULT_PT_SESSIONS_PER_WEEK,
    scheduledDays,
    scheduleByDay: buildScheduleState(assignment),
  }
}

export function getAssignmentScheduleFormPayload(
  formState: AssignmentScheduleFormState,
): AssignmentScheduleFormPayload {
  const scheduledSessions = normalizeScheduledDays(formState.scheduledDays).flatMap((day) => {
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

  const trainingPlan = normalizeAssignmentTrainingPlan(
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

  return {
    sessionsPerWeek: formState.sessionsPerWeek,
    scheduledSessions,
    trainingPlan,
  }
}

export function normalizeAssignmentScheduleForm(formState: AssignmentScheduleFormState) {
  const payload = getAssignmentScheduleFormPayload(formState)

  return {
    sessionsPerWeek: formState.sessionsPerWeek,
    scheduledSessions: payload.scheduledSessions,
    trainingPlan: payload.trainingPlan,
  }
}

export function validateAssignmentScheduleForm(
  formState: AssignmentScheduleFormState,
): AssignmentScheduleFormValidation {
  return {
    scheduledDaysError:
      formState.scheduledDays.length === formState.sessionsPerWeek
        ? null
        : `Select exactly ${formState.sessionsPerWeek} day${formState.sessionsPerWeek === 1 ? '' : 's'}.`,
    scheduledSessionErrors: getScheduledSessionErrors(formState),
    trainingPlanErrors: getTrainingPlanErrors(formState),
  }
}

export function PtAssignmentScheduleEditor({
  formState,
  defaultSessionTime = DEFAULT_PT_SESSION_TIME,
  isSubmitting,
  showValidationErrors,
  onFormStateChange,
}: PtAssignmentScheduleEditorProps) {
  const validation = validateAssignmentScheduleForm(formState)

  const updateScheduleFormState = (
    updater: (current: AssignmentScheduleFormState) => AssignmentScheduleFormState,
  ) => {
    onFormStateChange(updater(formState))
  }

  const handleDayToggle = (day: DayOfWeek) => {
    if (formState.scheduledDays.includes(day)) {
      updateScheduleFormState((current) => ({
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

    if (formState.scheduledDays.length >= formState.sessionsPerWeek) {
      toast({
        title: 'Too many days selected',
        description: `Select exactly ${formState.sessionsPerWeek} day${formState.sessionsPerWeek === 1 ? '' : 's'}.`,
        variant: 'destructive',
      })
      return
    }

    updateScheduleFormState((current) => {
      const scheduledDays = normalizeScheduledDays([...current.scheduledDays, day])

      return {
        ...current,
        scheduledDays,
        scheduleByDay: syncScheduleState(scheduledDays, current.scheduleByDay, defaultSessionTime),
      }
    })
  }

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="pt-frequency">Sessions per week</Label>
        <Select
          value={String(formState.sessionsPerWeek)}
          onValueChange={(value) =>
            updateScheduleFormState((current) => {
              const sessionsPerWeek = Number(value)
              const scheduledDays = current.scheduledDays.slice(0, sessionsPerWeek)

              return {
                ...current,
                sessionsPerWeek,
                scheduledDays,
                scheduleByDay: syncScheduleState(
                  scheduledDays,
                  current.scheduleByDay,
                  defaultSessionTime,
                ),
              }
            })
          }
          disabled={isSubmitting}
        >
          <SelectTrigger id="pt-frequency" aria-label="Sessions per week">
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
            const selected = formState.scheduledDays.includes(day)

            return (
              <Button
                key={day}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDayToggle(day)}
                disabled={isSubmitting}
                aria-pressed={selected}
              >
                {day}
              </Button>
            )
          })}
        </div>
        <p
          className={
            validation.scheduledDaysError
              ? 'text-destructive text-xs'
              : 'text-muted-foreground text-xs'
          }
        >
          Select exactly {formState.sessionsPerWeek} day
          {formState.sessionsPerWeek === 1 ? '' : 's'}.
        </p>
      </div>

      {formState.scheduledDays.length > 0 ? (
        <div className="space-y-3">
          <Label>Training Schedule</Label>
          <div className="space-y-3 rounded-md border p-4">
            {normalizeScheduledDays(formState.scheduledDays).map((day) => {
              const scheduleEntry = formState.scheduleByDay[day] ?? {
                mode: 'predefined' as const,
                trainingTypeName: '',
                sessionTime: defaultSessionTime,
              }
              const sessionTimeError = showValidationErrors
                ? validation.scheduledSessionErrors[day]
                : undefined
              const trainingPlanError = showValidationErrors
                ? validation.trainingPlanErrors[day]
                : undefined

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
                        updateScheduleFormState((current) => ({
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
                          aria-label={`${day} custom training type`}
                          value={scheduleEntry.trainingTypeName}
                          onChange={(event) =>
                            updateScheduleFormState((current) => ({
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
                            updateScheduleFormState((current) => ({
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
                          updateScheduleFormState((current) => ({
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
                  {sessionTimeError ? (
                    <p className="text-destructive text-xs">{sessionTimeError}</p>
                  ) : null}
                  {trainingPlanError ? (
                    <p className="text-destructive text-xs">{trainingPlanError}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </>
  )
}
