'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MemberDurationSelect } from '@/components/member-duration-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import {
  createMemberPauseRequest,
  pauseMemberMembership,
} from '@/lib/member-pause-requests'
import {
  calculatePlannedPauseResumeDate,
  calculateProjectedPausedMemberEndTime,
  getMemberPauseJamaicaNow,
  isSupportedMemberPauseDurationDays,
  MEMBER_PAUSE_ALLOWED_DURATIONS,
} from '@/lib/member-pause'
import { formatAccessDate, formatDateInputDisplay, getMemberDurationDays } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import type { Member } from '@/types'
import type { MemberDurationValue } from '@/lib/member-access-time'

type PauseMembershipDialogProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  requiresApproval: boolean
}

export function PauseMembershipDialog({
  member,
  open,
  onOpenChange,
  requiresApproval,
}: PauseMembershipDialogProps) {
  const queryClient = useQueryClient()
  const [duration, setDuration] = useState<MemberDurationValue | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setDuration('')
      setIsSubmitting(false)
    }
  }, [open])

  const plannedResumeDate = useMemo(() => {
    if (!duration) {
      return null
    }

    return calculatePlannedPauseResumeDate(
      getMemberDurationDays(duration),
      getMemberPauseJamaicaNow().dateValue,
    )
  }, [duration])

  const projectedEndTime = useMemo(() => {
    if (!duration) {
      return null
    }

    const durationDays = getMemberDurationDays(duration)

    if (!isSupportedMemberPauseDurationDays(durationDays)) {
      return null
    }

    return calculateProjectedPausedMemberEndTime(member.endTime, durationDays)
  }, [duration, member.endTime])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!duration) {
      toast({
        title: 'Duration required',
        description: 'Select how long the membership should be paused.',
        variant: 'destructive',
      })
      return
    }

    const durationDays = getMemberDurationDays(duration)

    if (!isSupportedMemberPauseDurationDays(durationDays)) {
      toast({
        title: 'Unsupported duration',
        description: 'Duration must match a supported membership option.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (requiresApproval) {
        await createMemberPauseRequest(member.id, {
          duration_days: durationDays,
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPauseRequests.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPauseRequests.pending }),
          queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.memberPicker.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
        ])
        onOpenChange(false)
        toast({
          title: 'Request submitted',
          description: 'Membership pause request submitted for admin approval.',
        })
        return
      }

      const result = await pauseMemberMembership(member.id, {
        duration_days: durationDays,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberPicker.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
      ])
      onOpenChange(false)
      toast({
        title: 'Membership paused',
        description:
          result.warning ??
          (plannedResumeDate
            ? `Membership will resume on ${formatDateInputDisplay(plannedResumeDate)}.`
            : 'Membership pause applied.'),
      })
    } catch (error) {
      toast({
        title: requiresApproval ? 'Request submission failed' : 'Pause failed',
        description:
          error instanceof Error
            ? error.message
            : requiresApproval
              ? 'Failed to submit the membership pause request.'
              : 'Failed to pause the membership.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent isLoading={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Pause Membership</DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? 'Submit a membership pause request for admin approval.'
              : "Pause this member's current membership access window."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="pause-membership-duration">Duration</Label>
            <MemberDurationSelect
              id="pause-membership-duration"
              value={duration}
              onValueChange={setDuration}
              disabled={isSubmitting}
              allowedDurations={MEMBER_PAUSE_ALLOWED_DURATIONS}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium text-muted-foreground">Membership will resume on</p>
            <p className="mt-1 text-base font-semibold">
              {plannedResumeDate
                ? formatDateInputDisplay(plannedResumeDate)
                : 'Select a duration above'}
            </p>
            <p className="mt-4 text-sm font-medium text-muted-foreground">
              New end date after resume
            </p>
            <p className="mt-1 text-base font-semibold">
              {projectedEndTime
                ? formatAccessDate(projectedEndTime.toISOString(), 'long')
                : 'Select a duration above'}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !duration}>
              {requiresApproval ? 'Submit for Approval' : 'Pause Membership'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
