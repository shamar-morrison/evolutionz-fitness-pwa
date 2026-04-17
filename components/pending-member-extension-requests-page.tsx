'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ClipboardCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMemberExtensionRequests } from '@/hooks/use-member-extension-requests'
import { toast } from '@/hooks/use-toast'
import { reviewMemberExtensionRequest } from '@/lib/member-extension-requests'
import {
  calculateProjectedMemberEndTime,
  formatMemberExtensionDate,
  formatMemberExtensionDuration,
  isMemberExtensionEligible,
} from '@/lib/member-extension'
import { queryKeys } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function PendingMemberExtensionRequestsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { requests, isLoading, error } = useMemberExtensionRequests()
  const [hiddenRequestIds, setHiddenRequestIds] = useState<string[]>([])
  const [reviewingRequestIds, setReviewingRequestIds] = useState<Set<string>>(() => new Set())
  const visibleRequests = useMemo(
    () => requests.filter((request) => !hiddenRequestIds.includes(request.id)),
    [hiddenRequestIds, requests],
  )

  const reviewRequest = async (
    requestId: string,
    memberId: string,
    action: 'approve' | 'reject',
  ) => {
    setReviewingRequestIds((current) => {
      const next = new Set(current)
      next.add(requestId)
      return next
    })
    setHiddenRequestIds((current) => (current.includes(requestId) ? current : [...current, requestId]))

    try {
      const result = await reviewMemberExtensionRequest(requestId, {
        action,
      })

      const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.memberExtensionRequests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberExtensionRequests.pending }),
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
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.unreadCount(profile.id),
          }),
        )
      }

      await Promise.all(invalidations)
      toast({
        title:
          action === 'approve'
            ? 'Extension request approved'
            : 'Extension request rejected',
        description: result.warning,
      })
    } catch (reviewError) {
      setHiddenRequestIds((current) => current.filter((id) => id !== requestId))
      toast({
        title: 'Review failed',
        description:
          reviewError instanceof Error
            ? reviewError.message
            : 'Failed to review the member extension request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingRequestIds((current) => {
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
        <h1 className="text-3xl font-bold tracking-tight">Extension Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review pending membership extension requests from front desk staff.
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
              {error instanceof Error ? error.message : 'Failed to load extension requests.'}
            </p>
          </CardContent>
        </Card>
      ) : visibleRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No pending extension requests.
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Pending</h2>
          </div>

          {visibleRequests.map((request) => {
            const isReviewing = reviewingRequestIds.has(request.id)
            const projectedEndTime = calculateProjectedMemberEndTime(
              request.currentEndTime,
              request.durationDays,
            )
            const canApprove = isMemberExtensionEligible(request.currentEndTime)

            return (
              <Card key={request.id}>
                <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{request.memberName}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                        <span>Submitted: {formatMemberExtensionDate(request.createdAt)}</span>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <p>Duration: {formatMemberExtensionDuration(request.durationDays)}</p>
                      <p>Current end date: {formatMemberExtensionDate(request.currentEndTime)}</p>
                      <p className="sm:col-span-2">
                        Projected new end date:{' '}
                        {projectedEndTime
                          ? formatMemberExtensionDate(projectedEndTime)
                          : 'Unavailable'}
                      </p>
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
                      onClick={() => void reviewRequest(request.id, request.memberId, 'approve')}
                      disabled={isReviewing || !canApprove}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void reviewRequest(request.id, request.memberId, 'reject')}
                      disabled={isReviewing}
                    >
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>
      )}
    </div>
  )
}
