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
import { toast } from '@/hooks/use-toast'
import {
  createPtAssignment,
  DAYS_OF_WEEK,
  normalizeScheduledDays,
  normalizeSessionTimeValue,
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

type FormState = {
  trainerId: string
  sessionsPerWeek: number
  scheduledDays: DayOfWeek[]
  sessionTime: string
  ptFee: string
  trainerPayout: string
}

function createInitialFormState(assignment?: TrainerClient | null): FormState {
  return {
    trainerId: assignment?.trainerId ?? '',
    sessionsPerWeek: assignment?.sessionsPerWeek ?? 3,
    scheduledDays: assignment ? normalizeScheduledDays(assignment.scheduledDays) : [],
    sessionTime: assignment?.sessionTime ?? '07:00',
    ptFee: assignment ? String(assignment.ptFee) : '',
    trainerPayout: assignment ? String(assignment.trainerPayout) : '',
  }
}

function normalizeFormState(formState: FormState) {
  return {
    trainerId: formState.trainerId,
    sessionsPerWeek: formState.sessionsPerWeek,
    scheduledDays: normalizeScheduledDays(formState.scheduledDays),
    sessionTime: normalizeSessionTimeValue(formState.sessionTime) ?? '',
    ptFee: formState.ptFee.trim(),
    trainerPayout: formState.trainerPayout.trim(),
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
  const initialFormState = useMemo(() => createInitialFormState(assignment), [assignment])
  const [formData, setFormData] = useState<FormState>(initialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = useMemo(
    () => JSON.stringify(normalizeFormState(formData)) !== JSON.stringify(normalizeFormState(initialFormState)),
    [formData, initialFormState],
  )
  const selectedTrainer = useMemo(
    () => trainers.find((trainer) => trainer.id === formData.trainerId) ?? null,
    [formData.trainerId, trainers],
  )

  useEffect(() => {
    setFormData(initialFormState)
    setIsSubmitting(false)
  }, [initialFormState, open])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(initialFormState)
      setIsSubmitting(false)
    }

    onOpenChange(nextOpen)
  }

  const handleDayToggle = (day: DayOfWeek) => {
    setFormData((current) => {
      if (current.scheduledDays.includes(day)) {
        return {
          ...current,
          scheduledDays: current.scheduledDays.filter((value) => value !== day),
        }
      }

      if (current.scheduledDays.length >= current.sessionsPerWeek) {
        toast({
          title: 'Too many days selected',
          description: 'Remove one of the selected days before choosing another.',
          variant: 'destructive',
        })
        return current
      }

      return {
        ...current,
        scheduledDays: normalizeScheduledDays([...current.scheduledDays, day]),
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (mode === 'create' && !formData.trainerId) {
      toast({
        title: 'Trainer required',
        description: 'Select a trainer before saving this assignment.',
        variant: 'destructive',
      })
      return
    }

    const normalizedSessionTime = normalizeSessionTimeValue(formData.sessionTime)

    if (!normalizedSessionTime) {
      toast({
        title: 'Invalid session time',
        description: 'Use the HH:MM time picker to choose a valid session time.',
        variant: 'destructive',
      })
      return
    }

    if (formData.scheduledDays.length !== formData.sessionsPerWeek) {
      toast({
        title: 'Schedule mismatch',
        description: 'Select the same number of days as the sessions per week value.',
        variant: 'destructive',
      })
      return
    }

    const ptFee = Number(formData.ptFee)
    const trainerPayout = Number(formData.trainerPayout)

    if (!Number.isInteger(ptFee) || ptFee < 0) {
      toast({
        title: 'Invalid PT fee',
        description: 'Enter a whole-number PT fee in JMD.',
        variant: 'destructive',
      })
      return
    }

    if (!Number.isInteger(trainerPayout) || trainerPayout < 0) {
      toast({
        title: 'Invalid trainer payout',
        description: 'Enter a whole-number trainer payout in JMD.',
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
              trainerPayout,
              sessionsPerWeek: formData.sessionsPerWeek,
              scheduledDays: normalizeScheduledDays(formData.scheduledDays),
              sessionTime: normalizedSessionTime,
            })
          : await updatePtAssignment(assignment?.id ?? '', {
              ptFee,
              trainerPayout,
              sessionsPerWeek: formData.sessionsPerWeek,
              scheduledDays: normalizeScheduledDays(formData.scheduledDays),
              sessionTime: normalizedSessionTime,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Assign Trainer' : 'Edit Assignment'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a new personal training assignment for this member.'
              : 'Update the trainer schedule, pricing, and payout details for this member.'}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${mode}-pt-frequency`}>Sessions per week</Label>
              <Select
                value={String(formData.sessionsPerWeek)}
                onValueChange={(value) =>
                  setFormData((current) => {
                    const sessionsPerWeek = Number(value)

                    return {
                      ...current,
                      sessionsPerWeek,
                      scheduledDays: current.scheduledDays.slice(0, sessionsPerWeek),
                    }
                  })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id={`${mode}-pt-frequency`}>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 session</SelectItem>
                  <SelectItem value="2">2 sessions</SelectItem>
                  <SelectItem value="3">3 sessions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${mode}-pt-time`}>Session time</Label>
              <Input
                id={`${mode}-pt-time`}
                type="time"
                step={60}
                value={formData.sessionTime}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    sessionTime: event.target.value,
                  }))
                }
                disabled={isSubmitting}
              />
            </div>
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
            <p className="text-muted-foreground text-xs">
              Select exactly {formData.sessionsPerWeek} day{formData.sessionsPerWeek === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor={`${mode}-pt-payout`}>Trainer Payout (JMD)</Label>
              <Input
                id={`${mode}-pt-payout`}
                type="number"
                min={0}
                step={1}
                value={formData.trainerPayout}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    trainerPayout: event.target.value,
                  }))
                }
                disabled={isSubmitting}
                required
              />
            </div>
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
                (mode === 'edit' && !hasChanges) ||
                (mode === 'create' && trainers.length === 0)
              }
            >
              {isSubmitting ? (
                mode === 'create' ? 'Assigning...' : 'Saving...'
              ) : mode === 'create' ? (
                <>
                  <Plus className="h-4 w-4" />
                  Assign Trainer
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
