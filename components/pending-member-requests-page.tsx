'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
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
import { useAuth } from '@/contexts/auth-context'
import { useAvailableCards } from '@/hooks/use-available-cards'
import { useMemberApprovalRequests } from '@/hooks/use-member-approval-requests'
import { toast } from '@/hooks/use-toast'
import { reviewMemberApprovalRequest } from '@/lib/member-approval-requests'
import { formatAccessDate } from '@/lib/member-access-time'
import { formatAvailableAccessCardLabel } from '@/lib/available-cards'
import { queryKeys } from '@/lib/query-keys'
import type { MemberApprovalRequest } from '@/types'

const EMPTY_CARD_VALUE = '__none__'

export function PendingMemberRequestsPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [selectedRequest, setSelectedRequest] = useState<MemberApprovalRequest | null>(null)
  const [selectedCardNo, setSelectedCardNo] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [submittingAction, setSubmittingAction] = useState<null | 'approved' | 'denied'>(null)
  const { requests, isLoading, error } = useMemberApprovalRequests('pending')
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
  } = useAvailableCards({ enabled: Boolean(selectedRequest) })

  const isSubmitting = submittingAction !== null
  const selectedAvailableCard = useMemo(
    () => availableCards.find((card) => card.cardNo === selectedCardNo) ?? null,
    [availableCards, selectedCardNo],
  )

  useEffect(() => {
    if (!selectedRequest || selectedCardNo || availableCards.length === 0) {
      return
    }

    if (availableCards.some((card) => card.cardNo === selectedRequest.cardNo)) {
      setSelectedCardNo(selectedRequest.cardNo)
    }
  }, [availableCards, selectedCardNo, selectedRequest])

  const resetReviewState = () => {
    setSelectedRequest(null)
    setSelectedCardNo('')
    setReviewNote('')
    setSubmittingAction(null)
  }

  const handleOpenReview = (request: MemberApprovalRequest) => {
    const defaultCardNo = availableCards.some((card) => card.cardNo === request.cardNo)
      ? request.cardNo
      : ''

    setSelectedRequest(request)
    setSelectedCardNo(defaultCardNo)
    setReviewNote('')
    setSubmittingAction(null)
  }

  const invalidateQueries = async () => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.memberApprovalRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.memberApprovalRequests.pending }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentMembers }),
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
  }

  const handleApprove = async () => {
    if (!selectedRequest) {
      return
    }

    if (!selectedCardNo) {
      toast({
        title: 'Card required',
        description: 'Select an available card before approving the request.',
        variant: 'destructive',
      })
      return
    }

    setSubmittingAction('approved')

    try {
      const { warning } = await reviewMemberApprovalRequest(selectedRequest.id, {
        status: 'approved',
        selected_card_no: selectedCardNo,
        review_note: reviewNote.trim() || null,
      })
      await invalidateQueries()
      resetReviewState()
      toast(
        warning
          ? {
              title: 'Member approved',
              description: warning,
            }
          : {
              title: 'Member approved',
            },
      )
    } catch (approvalError) {
      toast({
        title: 'Approval failed',
        description:
          approvalError instanceof Error
            ? approvalError.message
            : 'Failed to approve the member request.',
        variant: 'destructive',
      })
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleDeny = async () => {
    if (!selectedRequest) {
      return
    }

    setSubmittingAction('denied')

    try {
      await reviewMemberApprovalRequest(selectedRequest.id, {
        status: 'denied',
        review_note: reviewNote.trim() || null,
      })
      await invalidateQueries()
      resetReviewState()
      toast({
        title: 'Member request denied',
      })
    } catch (denyError) {
      toast({
        title: 'Review failed',
        description:
          denyError instanceof Error
            ? denyError.message
            : 'Failed to deny the member request.',
        variant: 'destructive',
      })
    } finally {
      setSubmittingAction(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Notifications</p>
          <h1 className="text-3xl font-bold tracking-tight">Member Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review submitted member requests, confirm the member details, and assign the final card.
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
                {error instanceof Error ? error.message : 'Failed to load member requests.'}
              </p>
            </CardContent>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No pending member requests.
            </CardContent>
          </Card>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Pending</h2>
            </div>

            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex flex-col gap-4 px-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">{request.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Submitted by {request.submittedByName ?? 'Unknown staff member'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {request.memberTypeName} · Card {request.cardCode} / {request.cardNo}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatAccessDate(request.beginTime, 'long')} to {formatAccessDate(request.endTime, 'long')}
                    </p>
                    <p className="text-sm">{request.remark ?? 'No note'}</p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenReview(request)}
                  >
                    Review
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            resetReviewState()
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]"
          isLoading={isSubmitting}
        >
          <DialogHeader>
            <DialogTitle>Review Member Request</DialogTitle>
            <DialogDescription>
              Confirm the request details and select the final card.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Member" value={selectedRequest.name} />
                <ReadOnlyField
                  label="Submitted by"
                  value={selectedRequest.submittedByName ?? 'Unknown staff member'}
                />
                <ReadOnlyField label="Submitted type" value={selectedRequest.memberTypeName} />
                <ReadOnlyField
                  label="Submitted card"
                  value={`${selectedRequest.cardCode} / ${selectedRequest.cardNo}`}
                />
                <ReadOnlyField label="Start date" value={formatAccessDate(selectedRequest.beginTime, 'long')} />
                <ReadOnlyField label="End date" value={formatAccessDate(selectedRequest.endTime, 'long')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-request-card">Available Access Card</Label>
                <Select
                  value={selectedCardNo || EMPTY_CARD_VALUE}
                  onValueChange={(value) => setSelectedCardNo(value === EMPTY_CARD_VALUE ? '' : value)}
                  disabled={isSubmitting || isCardsLoading}
                >
                  <SelectTrigger id="member-request-card">
                    <SelectValue
                      placeholder={isCardsLoading ? 'Loading cards...' : 'Select an access card'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_CARD_VALUE}>Select an access card</SelectItem>
                    {availableCards.map((card) => (
                      <SelectItem key={card.cardNo} value={card.cardNo}>
                        {formatAvailableAccessCardLabel(card)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cardsError ? (
                  <p className="text-xs text-destructive">{cardsError}</p>
                ) : selectedRequest.cardNo !== selectedCardNo && !selectedAvailableCard ? (
                  <p className="text-xs text-muted-foreground">
                    The submitted card is no longer available. Select another card before approving.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Choose the card that should be provisioned when the request is approved.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-request-review-note">Review Note</Label>
                <Textarea
                  id="member-request-review-note"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  disabled={isSubmitting}
                  placeholder="Optional approval or denial note"
                  className="resize-none"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetReviewState}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDeny()}
              disabled={isSubmitting}
              loading={submittingAction === 'denied'}
            >
              Deny
            </Button>
            <Button
              type="button"
              onClick={() => void handleApprove()}
              disabled={isSubmitting}
              loading={submittingAction === 'approved'}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
