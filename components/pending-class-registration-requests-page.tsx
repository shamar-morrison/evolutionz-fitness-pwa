'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useClassRegistrationRequests } from '@/hooks/use-class-registration-requests'
import { toast } from '@/hooks/use-toast'
import {
  reviewClassRegistrationEditRequest,
  reviewClassRegistrationRemovalRequest,
} from '@/lib/class-registration-requests'
import {
  formatClassDate,
  formatClassRegistrationFeeTypeLabel,
  formatOptionalJmd,
} from '@/lib/classes'
import { queryKeys } from '@/lib/query-keys'
import type {
  ClassRegistrationEditRequest,
  ClassRegistrationRemovalRequest,
} from '@/types'
import { ClassRegistrationReceiptPreviewDialog } from '@/components/class-registration-receipt-preview-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type QueueItem =
  | {
      kind: 'edit'
      id: string
      createdAt: string
      request: ClassRegistrationEditRequest
    }
  | {
      kind: 'remove'
      id: string
      createdAt: string
      request: ClassRegistrationRemovalRequest
    }

type ReceiptState = {
  registrationId: string
}

function formatRequestTimestamp(value: string) {
  const timestamp = new Date(value)

  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

function formatPaymentReceived(value: boolean) {
  return value ? 'Paid' : 'Unpaid'
}

export function PendingClassRegistrationRequestsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { editRequests, removalRequests, isLoading, error } = useClassRegistrationRequests()
  const [hiddenRequestIds, setHiddenRequestIds] = useState<string[]>([])
  const [reviewingRequestIds, setReviewingRequestIds] = useState<Set<string>>(() => new Set())
  const [receiptState, setReceiptState] = useState<ReceiptState | null>(null)

  const visibleItems = useMemo(() => {
    const items: QueueItem[] = [
      ...editRequests.map((request) => ({
        kind: 'edit' as const,
        id: request.id,
        createdAt: request.createdAt,
        request,
      })),
      ...removalRequests.map((request) => ({
        kind: 'remove' as const,
        id: request.id,
        createdAt: request.createdAt,
        request,
      })),
    ]

    return items
      .filter((item) => !hiddenRequestIds.includes(item.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [editRequests, hiddenRequestIds, removalRequests])

  const invalidateQueries = async (classId: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovalCounts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classRegistrationRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classRegistrationRequests.pending }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classes.detail(classId) }),
      queryClient.invalidateQueries({ queryKey: ['classes', 'registrations'], exact: false }),
      queryClient.invalidateQueries({ queryKey: ['classes', 'sessions'], exact: false }),
      queryClient.invalidateQueries({ queryKey: queryKeys.classes.all }),
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

  const reviewEditRequest = async (
    request: ClassRegistrationEditRequest,
    action: 'approve' | 'reject',
  ) => {
    setReviewingRequestIds((current) => new Set(current).add(request.id))
    setHiddenRequestIds((current) => (current.includes(request.id) ? current : [...current, request.id]))

    try {
      const result = await reviewClassRegistrationEditRequest(request.id, action)
      await invalidateQueries(request.classId)
      toast({
        title:
          action === 'approve'
            ? 'Class registration edit approved'
            : 'Class registration edit rejected',
      })

      if (
        action === 'approve' &&
        result.amountChanged &&
        (result.registration?.amount_paid ?? 0) > 0 &&
        result.registration?.registrant_email
      ) {
        setReceiptState({
          registrationId: request.registrationId,
        })
      }
    } catch (error) {
      setHiddenRequestIds((current) => current.filter((id) => id !== request.id))
      toast({
        title: 'Review failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to review the class registration edit request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingRequestIds((current) => {
        const next = new Set(current)
        next.delete(request.id)
        return next
      })
    }
  }

  const reviewRemovalRequest = async (
    request: ClassRegistrationRemovalRequest,
    action: 'approve' | 'reject',
  ) => {
    setReviewingRequestIds((current) => new Set(current).add(request.id))
    setHiddenRequestIds((current) => (current.includes(request.id) ? current : [...current, request.id]))

    try {
      await reviewClassRegistrationRemovalRequest(request.id, action)
      await invalidateQueries(request.classId)
      toast({
        title:
          action === 'approve'
            ? 'Class registration removal approved'
            : 'Class registration removal rejected',
      })
    } catch (error) {
      setHiddenRequestIds((current) => current.filter((id) => id !== request.id))
      toast({
        title: 'Review failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to review the class registration removal request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingRequestIds((current) => {
        const next = new Set(current)
        next.delete(request.id)
        return next
      })
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Notifications</p>
          <h1 className="text-3xl font-bold tracking-tight">Class Registration Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review class registration edits and removals submitted by front desk staff.
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
                {error instanceof Error ? error.message : 'Failed to load class registration requests.'}
              </p>
            </CardContent>
          </Card>
        ) : visibleItems.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No pending class registration requests.
            </CardContent>
          </Card>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Pending</h2>
            </div>

            {visibleItems.map((item) => {
              const isReviewing = reviewingRequestIds.has(item.id)

              if (item.kind === 'edit') {
                const request = item.request

                return (
                  <Card key={item.id}>
                    <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{request.registrantName}</h3>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Edit
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>Class: {request.className}</span>
                            <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                            <span>Submitted: {formatRequestTimestamp(request.createdAt)}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p>
                            Fee type: {formatClassRegistrationFeeTypeLabel(request.currentFeeType)} →{' '}
                            {formatClassRegistrationFeeTypeLabel(request.proposedFeeType)}
                          </p>
                          <p>
                            Amount: {formatOptionalJmd(request.currentAmountPaid)} →{' '}
                            {request.proposedPaymentReceived
                              ? formatOptionalJmd(request.proposedAmountPaid)
                              : formatOptionalJmd(0)}
                          </p>
                          <p>
                            Period start: {formatClassDate(request.currentPeriodStart)} →{' '}
                            {formatClassDate(request.proposedPeriodStart)}
                          </p>
                          <p>
                            Payment status: {formatPaymentReceived(request.currentPaymentReceived)} →{' '}
                            {formatPaymentReceived(request.proposedPaymentReceived)}
                          </p>
                          <p className="sm:col-span-2">
                            Notes: {request.currentNotes ?? 'None'} → {request.proposedNotes ?? 'None'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          type="button"
                          onClick={() => void reviewEditRequest(request, 'approve')}
                          disabled={isReviewing}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void reviewEditRequest(request, 'reject')}
                          disabled={isReviewing}
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              }

              const request = item.request

              return (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{request.registrantName}</h3>
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Remove
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>Class: {request.className}</span>
                          <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                          <span>Submitted: {formatRequestTimestamp(request.createdAt)}</span>
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <p>Amount to reverse: {formatOptionalJmd(request.amountPaidAtRequest)}</p>
                        <p>
                          Recorded payment:{' '}
                          {request.amountPaidAtRequest > 0 ? 'Will be reversed' : 'No payment recorded'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button
                        type="button"
                        onClick={() => void reviewRemovalRequest(request, 'approve')}
                        disabled={isReviewing}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void reviewRemovalRequest(request, 'reject')}
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

      <ClassRegistrationReceiptPreviewDialog
        registrationId={receiptState?.registrationId ?? null}
        open={receiptState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptState(null)
          }
        }}
      />
    </>
  )
}
