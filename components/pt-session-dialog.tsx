'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePtSessionDetail } from '@/hooks/use-pt-scheduling'
import { toast } from '@/hooks/use-toast'
import {
  formatPtSessionDateTime,
  formatPtSessionDateTimeInputValue,
  formatPtSessionStatusLabel,
  SESSION_STATUSES,
  updatePtSession,
  type PtSessionChange,
  type SessionStatus,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'

type PtSessionDialogProps = {
  sessionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = {
  scheduledAt: string
  status: SessionStatus
  notes: string
}

function createInitialFormState(sessionId: string | null, detail: ReturnType<typeof usePtSessionDetail>['detail']): FormState | null {
  if (!sessionId || !detail) {
    return null
  }

  return {
    scheduledAt: formatPtSessionDateTimeInputValue(detail.session.scheduledAt),
    status: detail.session.status,
    notes: detail.session.notes ?? '',
  }
}

function describeChange(change: PtSessionChange) {
  if (change.changeType === 'reschedule') {
    const oldValue = typeof change.oldValue?.scheduledAt === 'string' ? change.oldValue.scheduledAt : null
    const newValue = typeof change.newValue?.scheduledAt === 'string' ? change.newValue.scheduledAt : null

    if (oldValue && newValue) {
      return `${formatPtSessionDateTime(oldValue)} to ${formatPtSessionDateTime(newValue)}`
    }
  }

  if (change.changeType === 'status_change') {
    const oldStatus =
      typeof change.oldValue?.status === 'string'
        ? formatPtSessionStatusLabel(change.oldValue.status as SessionStatus)
        : null
    const newStatus =
      typeof change.newValue?.status === 'string'
        ? formatPtSessionStatusLabel(change.newValue.status as SessionStatus)
        : null

    if (oldStatus && newStatus) {
      return `${oldStatus} to ${newStatus}`
    }
  }

  return 'Session details updated.'
}

export function PtSessionDialog({ sessionId, open, onOpenChange }: PtSessionDialogProps) {
  const queryClient = useQueryClient()
  const { detail, isLoading, error } = usePtSessionDetail(sessionId ?? '', open && Boolean(sessionId))
  const [formData, setFormData] = useState<FormState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialFormState = useMemo(() => createInitialFormState(sessionId, detail), [detail, sessionId])
  const hasChanges = useMemo(() => {
    if (!formData || !initialFormState) {
      return false
    }

    return JSON.stringify(formData) !== JSON.stringify(initialFormState)
  }, [formData, initialFormState])

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!sessionId || !formData) {
      return
    }

    if (!formData.scheduledAt) {
      toast({
        title: 'Scheduled date required',
        description: 'Choose a new scheduled date and time before saving.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      await updatePtSession(sessionId, {
        scheduledAt: formData.scheduledAt,
        status: formData.status,
        notes: formData.notes.trim() || null,
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.ptScheduling.sessions({}),
          exact: false,
        }),
        queryClient.invalidateQueries({ queryKey: ['pt-sessions', 'detail', sessionId] }),
      ])
      handleOpenChange(false)
      toast({
        title: 'Session updated',
        description: 'The PT session was updated successfully.',
      })
    } catch (error) {
      toast({
        title: 'Session update failed',
        description: error instanceof Error ? error.message : 'Failed to update the PT session.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Session Details</DialogTitle>
          <DialogDescription>
            View the current PT session details and update the scheduled time, status, or notes.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : 'Failed to load the PT session.'}
          </p>
        ) : detail && formData ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-md border p-4">
              <p className="font-medium">{detail.session.memberName ?? 'Unknown member'}</p>
              <p className="text-muted-foreground text-sm">
                Trainer: {detail.session.trainerName ?? 'Unknown trainer'}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Currently scheduled for {formatPtSessionDateTime(detail.session.scheduledAt)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-session-scheduled-at">Scheduled At</Label>
              <Input
                id="pt-session-scheduled-at"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(event) =>
                  setFormData((current) =>
                    current
                      ? {
                          ...current,
                          scheduledAt: event.target.value,
                        }
                      : current,
                  )
                }
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-session-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) =>
                    current
                      ? {
                          ...current,
                          status: value as SessionStatus,
                        }
                      : current,
                  )
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="pt-session-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatPtSessionStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-session-notes">Notes</Label>
              <Textarea
                id="pt-session-notes"
                value={formData.notes}
                onChange={(event) =>
                  setFormData((current) =>
                    current
                      ? {
                          ...current,
                          notes: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder="Add any notes for this PT session."
                disabled={isSubmitting}
                rows={4}
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div>
                <h3 className="font-medium">Change History</h3>
                <p className="text-muted-foreground text-sm">
                  Read-only audit history for this session.
                </p>
              </div>

              {detail.changes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No change history recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {detail.changes.map((change) => (
                    <div key={change.id} className="rounded-md border p-3">
                      <p className="font-medium capitalize">{change.changeType.replace('_', ' ')}</p>
                      <p className="text-muted-foreground mt-1 text-sm">{describeChange(change)}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatPtSessionDateTime(change.createdAt)}
                        {change.changedByName ? ` by ${change.changedByName}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
              <Button type="submit" disabled={isSubmitting || !hasChanges}>
                {isSubmitting ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
