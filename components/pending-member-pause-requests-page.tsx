'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ClipboardCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMemberPauseRequests } from '@/hooks/use-member-pause-requests'
import { toast } from '@/hooks/use-toast'
import {
  reviewMemberPauseRequest,
  reviewMemberPauseResumeRequest,
} from '@/lib/member-pause-requests'
import {
  getMemberPauseDurationLabel,
  isMemberPauseEligible,
} from '@/lib/member-pause'
import { formatAccessDate, formatDateInputDisplay } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function PendingMemberPauseRequestsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { pauseRequests, earlyResumeRequests, isLoading, error } = useMemberPauseRequests()
  const [hiddenPauseRequestIds, setHiddenPauseRequestIds] = useState<string[]>([])
  const [hiddenResumeRequestIds, setHiddenResumeRequestIds] = useState<string[]>([])
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(() => new Set())
  const visiblePauseRequests = useMemo(
    () => pauseRequests.filter((request) => !hiddenPauseRequestIds.includes(request.id)),
    [hiddenPauseRequestIds, pauseRequests],
  )
  const visibleEarlyResumeRequests = useMemo(
    () => earlyResumeRequests.filter((request) => !hiddenResumeRequestIds.includes(request.id)),
    [earlyResumeRequests, hiddenResumeRequestIds],
  )

  const invalidateQueries = async (memberId: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovalCounts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPauseRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberPauseRequests.pending }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(memberId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
    ]

    if (profile?.id) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profile.id) }),
      )
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.archived(profile.id) }),
      )
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(profile.id),
        }),
      )
    }

    await Promise.all(invalidations)
  }

  const reviewPauseRequest = async (
    requestId: string,
    memberId: string,
    action: 'approve' | 'reject',
  ) => {
    setReviewingIds((current) => new Set(current).add(requestId))
    setHiddenPauseRequestIds((current) => (current.includes(requestId) ? current : [...current, requestId]))

    try {
      const result = await reviewMemberPauseRequest(requestId, { action })
      await invalidateQueries(memberId)
      toast({
        title: action === 'approve' ? 'Pause request approved' : 'Pause request rejected',
        ...(result.warning ? { description: result.warning } : {}),
      })
    } catch (reviewError) {
      setHiddenPauseRequestIds((current) => current.filter((id) => id !== requestId))
      toast({
        title: 'Review failed',
        description:
          reviewError instanceof Error
            ? reviewError.message
            : 'Failed to review the member pause request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingIds((current) => {
        const next = new Set(current)
        next.delete(requestId)
        return next
      })
    }
  }

  const reviewResumeRequest = async (
    requestId: string,
    memberId: string,
    action: 'approve' | 'reject',
  ) => {
    setReviewingIds((current) => new Set(current).add(requestId))
    setHiddenResumeRequestIds((current) =>
      current.includes(requestId) ? current : [...current, requestId],
    )

    try {
      const result = await reviewMemberPauseResumeRequest(requestId, { action })
      await invalidateQueries(memberId)
      toast({
        title: action === 'approve' ? 'Early resume approved' : 'Early resume rejected',
        ...(result.warning ? { description: result.warning } : {}),
      })
    } catch (reviewError) {
      setHiddenResumeRequestIds((current) => current.filter((id) => id !== requestId))
      toast({
        title: 'Review failed',
        description:
          reviewError instanceof Error
            ? reviewError.message
            : 'Failed to review the early resume request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingIds((current) => {
        const next = new Set(current)
        next.delete(requestId)
        return next
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Notifications</p>
        <h1 className="text-3xl font-bold tracking-tight">Membership Pauses</h1>
        <p className="text-sm text-muted-foreground">
          Review pause-start and early-resume requests from front desk staff.
        </p>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load pause requests.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Membership Pauses</h2>
            </div>

            {visiblePauseRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No pending membership pause requests.
                </CardContent>
              </Card>
            ) : (
              visiblePauseRequests.map((request) => {
                const isReviewing = reviewingIds.has(request.id)
                const canApprove =
                  request.currentStatus !== null &&
                  isMemberPauseEligible(request.currentEndTime, request.currentStatus)

                return (
                  <Card key={request.id}>
                    <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">{request.memberName}</h3>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                            <span>Submitted: {formatDateInputDisplay(request.createdAt.slice(0, 10))}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p>Duration: {getMemberPauseDurationLabel(request.durationDays)}</p>
                          <p>Current end date: {formatAccessDate(request.currentEndTime, 'long')}</p>
                          <p>Planned resume date: {formatDateInputDisplay(request.plannedResumeDate)}</p>
                        </div>

                        {!canApprove ? (
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <CalendarDays className="h-4 w-4" />
                            <span>Member has no active membership. Approval unavailable.</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          type="button"
                          onClick={() => void reviewPauseRequest(request.id, request.memberId, 'approve')}
                          disabled={isReviewing || !canApprove}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void reviewPauseRequest(request.id, request.memberId, 'reject')}
                          disabled={isReviewing}
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Early Resume Requests</h2>
            </div>

            {visibleEarlyResumeRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No pending early resume requests.
                </CardContent>
              </Card>
            ) : (
              visibleEarlyResumeRequests.map((request) => {
                const isReviewing = reviewingIds.has(request.id)

                return (
                  <Card key={request.id}>
                    <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">{request.memberName}</h3>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                            <span>Submitted: {formatDateInputDisplay(request.createdAt.slice(0, 10))}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p>Pause started: {formatDateInputDisplay(request.pauseStartDate)}</p>
                          <p>Planned resume: {formatDateInputDisplay(request.plannedResumeDate)}</p>
                          <p className="sm:col-span-2">
                            Original end date: {formatAccessDate(request.originalEndTime, 'long')}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          type="button"
                          onClick={() => void reviewResumeRequest(request.id, request.memberId, 'approve')}
                          disabled={isReviewing}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void reviewResumeRequest(request.id, request.memberId, 'reject')}
                          disabled={isReviewing}
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </section>
        </>
      )}
    </div>
  )
}
