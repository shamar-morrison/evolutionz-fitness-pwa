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
  createMemberExtensionRequest,
  extendMemberMembership,
} from '@/lib/member-extension-requests'
import {
  calculateProjectedMemberEndTime,
  getMemberExtensionDurationDays,
} from '@/lib/member-extension'
import { formatAccessDate } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import type { Member } from '@/types'
import type { MemberDurationValue } from '@/lib/member-access-time'

type ExtendMembershipDialogProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  requiresApproval: boolean
}

export function ExtendMembershipDialog({
  member,
  open,
  onOpenChange,
  requiresApproval,
}: ExtendMembershipDialogProps) {
  const queryClient = useQueryClient()
  const [duration, setDuration] = useState<MemberDurationValue | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setDuration('')
      setIsSubmitting(false)
    }
  }, [open])

  const projectedEndTime = useMemo(() => {
    if (!duration) {
      return null
    }

    return calculateProjectedMemberEndTime(
      member.endTime,
      getMemberExtensionDurationDays(duration),
    )
  }, [duration, member.endTime])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!duration) {
      toast({
        title: 'Duration required',
        description: 'Select how long the membership should be extended.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const durationDays = getMemberExtensionDurationDays(duration)

      if (requiresApproval) {
        await createMemberExtensionRequest(member.id, {
          duration_days: durationDays,
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.memberExtensionRequests.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.memberExtensionRequests.pending }),
        ])
        onOpenChange(false)
        toast({
          title: 'Request submitted',
          description: 'Membership extension request submitted for admin approval.',
        })
        return
      }

      const result = await extendMemberMembership(member.id, {
        duration_days: durationDays,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
      ])
      onOpenChange(false)
      toast({
        title: 'Membership extended',
        description:
          result.warning ?? `New end date: ${formatAccessDate(result.newEndTime, 'long')}.`,
      })
    } catch (error) {
      toast({
        title: requiresApproval ? 'Request submission failed' : 'Extension failed',
        description:
          error instanceof Error
            ? error.message
            : requiresApproval
              ? 'Failed to submit the membership extension request.'
              : 'Failed to extend the membership.',
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
          <DialogTitle>Extend Membership</DialogTitle>
          <DialogDescription>
            {requiresApproval
              ? 'Submit a membership extension request for admin approval.'
              : 'Extend this member’s current membership access window.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="extend-membership-duration">Duration</Label>
            <MemberDurationSelect
              id="extend-membership-duration"
              value={duration}
              onValueChange={setDuration}
              disabled={isSubmitting}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium text-muted-foreground">New end date</p>
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
              {requiresApproval ? 'Submit for Approval' : 'Extend Membership'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
