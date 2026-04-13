'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { BanknoteIcon, ClipboardCheck, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMemberPaymentRequests } from '@/hooks/use-member-payment-requests'
import { toast } from '@/hooks/use-toast'
import { MEMBER_PAYMENT_METHOD_OPTIONS } from '@/lib/member-payments'
import { reviewMemberPaymentRequest } from '@/lib/member-payment-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberPaymentRequest } from '@/types'
import { MemberPaymentReceiptPreviewDialog } from '@/components/member-payment-receipt-preview-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const amountFormatter = new Intl.NumberFormat('en-JM', {
  style: 'currency',
  currency: 'JMD',
})

type ApprovedReceiptState = {
  memberId: string
  memberName: string
  memberEmail: string | null
  paymentId: string
  receiptSentAt: string | null
}

function formatRequestTimestamp(value: string) {
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatPaymentDate(value: string) {
  return format(new Date(`${value}T00:00:00`), 'MMM d, yyyy')
}

function formatPaymentMethod(value: MemberPaymentRequest['paymentMethod']) {
  return (
    MEMBER_PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label ?? value
  )
}

export function PendingMemberPaymentRequestsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { requests, isLoading, error } = useMemberPaymentRequests()
  const [hiddenRequestIds, setHiddenRequestIds] = useState<string[]>([])
  const [denyRequest, setDenyRequest] = useState<MemberPaymentRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [reviewingRequestIds, setReviewingRequestIds] = useState<Set<string>>(() => new Set())
  const [approvedReceiptState, setApprovedReceiptState] = useState<ApprovedReceiptState | null>(null)
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false)
  const visibleRequests = useMemo(
    () => requests.filter((request) => !hiddenRequestIds.includes(request.id)),
    [hiddenRequestIds, requests],
  )

  const reviewRequest = async (
    request: MemberPaymentRequest,
    action: 'approve' | 'deny',
    nextRejectionReason?: string | null,
  ) => {
    setReviewingRequestIds((current) => {
      const next = new Set(current)
      next.add(request.id)
      return next
    })
    setHiddenRequestIds((current) => (current.includes(request.id) ? current : [...current, request.id]))

    try {
      const result = await reviewMemberPaymentRequest(request.id, {
        action,
        rejectionReason: nextRejectionReason ?? null,
      })
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.pending }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberPayments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(request.memberId) }),
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
        title: action === 'approve' ? 'Payment request approved' : 'Payment request denied',
      })

      if (action === 'approve' && result.paymentId) {
        setApprovedReceiptState({
          memberId: request.memberId,
          memberName: request.memberName,
          memberEmail: request.memberEmail,
          paymentId: result.paymentId,
          receiptSentAt: null,
        })
      }
    } catch (error) {
      setHiddenRequestIds((current) => current.filter((id) => id !== request.id))
      toast({
        title: 'Review failed',
        description:
          error instanceof Error ? error.message : 'Failed to review the member payment request.',
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
          <h1 className="text-3xl font-bold tracking-tight">Payment Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review payment recordings submitted by front desk staff before they are posted.
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
                {error instanceof Error ? error.message : 'Failed to load member payment requests.'}
              </p>
            </CardContent>
          </Card>
        ) : visibleRequests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No pending payment requests.
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

              return (
                <Card key={request.id}>
                  <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold">{request.memberName}</h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                          <span>Submitted: {formatRequestTimestamp(request.createdAt)}</span>
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <p>Amount (JMD): {amountFormatter.format(request.amount)}</p>
                        <p>Payment Method: {formatPaymentMethod(request.paymentMethod)}</p>
                        <p>Payment Date: {formatPaymentDate(request.paymentDate)}</p>
                        <p>
                          Membership Type:{' '}
                          {request.paymentType === 'card_fee'
                            ? 'Card Fee'
                            : (request.memberTypeName ?? 'Use current member type')}
                        </p>
                        <p className="sm:col-span-2">Notes: {request.notes ?? 'None'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button
                        type="button"
                        onClick={() => void reviewRequest(request, 'approve')}
                        disabled={isReviewing}
                      >
                        <BanknoteIcon className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDenyRequest(request)
                          setRejectionReason('')
                        }}
                        disabled={isReviewing}
                      >
                        Deny
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}
      </div>

      <Dialog open={denyRequest !== null} onOpenChange={(open) => !open && setDenyRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny payment request?</DialogTitle>
            <DialogDescription>
              Add an optional rejection reason before denying this payment request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Optional rejection reason"
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDenyRequest(null)}
              disabled={denyRequest !== null && reviewingRequestIds.has(denyRequest.id)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={denyRequest !== null && reviewingRequestIds.has(denyRequest.id)}
              onClick={() => {
                if (!denyRequest) {
                  return
                }

                const activeRequest = denyRequest
                setDenyRequest(null)
                void reviewRequest(activeRequest, 'deny', rejectionReason.trim() || null)
              }}
            >
              Deny Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={approvedReceiptState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setApprovedReceiptState(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment request approved</DialogTitle>
            <DialogDescription>
              The payment for {approvedReceiptState?.memberName ?? 'this member'} has been recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApprovedReceiptState(null)}
            >
              Done
            </Button>
            {approvedReceiptState?.memberEmail ? (
              <Button
                type="button"
                onClick={() => setReceiptPreviewOpen(true)}
                disabled={Boolean(approvedReceiptState.receiptSentAt)}
              >
                <Mail className="h-4 w-4" />
                {approvedReceiptState.receiptSentAt ? 'Receipt Sent' : 'Send Receipt'}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button type="button" disabled>
                      <Mail className="h-4 w-4" />
                      Send Receipt
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Add an email address to the member profile before sending a receipt.
                </TooltipContent>
              </Tooltip>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MemberPaymentReceiptPreviewDialog
        memberId={approvedReceiptState?.memberId ?? ''}
        paymentId={approvedReceiptState?.paymentId ?? null}
        open={receiptPreviewOpen}
        onOpenChange={setReceiptPreviewOpen}
        onSent={(receiptSentAt) => {
          setApprovedReceiptState((currentState) =>
            currentState
              ? {
                  ...currentState,
                  receiptSentAt,
                }
              : currentState,
          )
          if (approvedReceiptState?.memberId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.memberPayments.member(approvedReceiptState.memberId),
            })
          }
        }}
      />
    </>
  )
}
