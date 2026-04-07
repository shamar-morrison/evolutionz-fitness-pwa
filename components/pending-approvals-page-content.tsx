'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { RescheduleDateTimePicker } from '@/components/reschedule-date-time-picker'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  useRescheduleRequests,
  useSessionUpdateRequests,
} from '@/hooks/use-pt-scheduling'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/auth-context'
import {
  type ApprovalRequestStatus,
  formatPtSessionDateTime,
  formatPtSessionDateTimeInputValue,
  formatPtSessionStatusLabel,
  reviewRescheduleRequest,
  reviewSessionUpdateRequest,
  type RescheduleRequest,
  type SessionUpdateRequest,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'

export type PendingApprovalsView = 'reschedule-requests' | 'session-updates'

const pageContent = {
  'reschedule-requests': {
    title: 'Reschedule Requests',
    description: 'Review trainer reschedule requests and approve or deny proposed time changes.',
  },
  'session-updates': {
    title: 'Session Updates',
    description:
      'Review trainer session status update requests and approve or deny each change.',
  },
} as const

const rescheduleTabLabels: Record<ApprovalRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
}

const rescheduleEmptyLabels: Record<ApprovalRequestStatus, string> = {
  pending: 'No pending reschedule requests.',
  approved: 'No approved reschedule requests.',
  denied: 'No denied reschedule requests.',
}

export function PendingApprovalsPageContent({
  view,
}: {
  view: PendingApprovalsView
}) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [selectedRescheduleRequest, setSelectedRescheduleRequest] = useState<RescheduleRequest | null>(
    null,
  )
  const [selectedSessionUpdateRequest, setSelectedSessionUpdateRequest] =
    useState<SessionUpdateRequest | null>(null)
  const [approvedTime, setApprovedTime] = useState('')
  const [approvedTimeValidationMessage, setApprovedTimeValidationMessage] =
    useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [activeRescheduleStatus, setActiveRescheduleStatus] =
    useState<ApprovalRequestStatus>('pending')
  const rescheduleRequestsQuery = useRescheduleRequests(
    view === 'reschedule-requests' ? activeRescheduleStatus : undefined,
    {
      enabled: view === 'reschedule-requests',
    },
  )
  const sessionUpdateRequestsQuery = useSessionUpdateRequests('pending', {
    enabled: view === 'session-updates',
  })
  const content = pageContent[view]

  const invalidateApprovalQueries = async () => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sessionUpdateRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.pending }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sessionUpdateRequests.pending }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.ptScheduling.sessions({}),
        exact: false,
      }),
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

  const handleOpenRescheduleReview = (request: RescheduleRequest) => {
    setSelectedRescheduleRequest(request)
    setApprovedTime(formatPtSessionDateTimeInputValue(request.proposedAt))
    setApprovedTimeValidationMessage(null)
    setReviewNote(request.reviewNote ?? '')
  }

  const handleReviewRescheduleRequest = async (status: 'approved' | 'denied') => {
    if (
      !selectedRescheduleRequest ||
      (status === 'approved' && (!approvedTime || approvedTimeValidationMessage))
    ) {
      return
    }

    setIsSubmittingReview(true)

    try {
      await reviewRescheduleRequest(selectedRescheduleRequest.id, {
        status,
        proposedAt: status === 'approved' ? approvedTime : undefined,
        reviewNote: reviewNote.trim() || null,
      })
      await invalidateApprovalQueries()
      setSelectedRescheduleRequest(null)
      toast({
        title: status === 'approved' ? 'Reschedule approved' : 'Reschedule denied',
      })
    } catch (error) {
      toast({
        title: 'Review failed',
        description:
          error instanceof Error ? error.message : 'Failed to review the reschedule request.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  const handleOpenSessionUpdateReview = (request: SessionUpdateRequest) => {
    setSelectedSessionUpdateRequest(request)
    setReviewNote(request.reviewNote ?? '')
  }

  const handleReviewSessionUpdateRequest = async (status: 'approved' | 'denied') => {
    if (!selectedSessionUpdateRequest) {
      return
    }

    setIsSubmittingReview(true)

    try {
      await reviewSessionUpdateRequest(selectedSessionUpdateRequest.id, {
        status,
        reviewNote: reviewNote.trim() || null,
      })
      await invalidateApprovalQueries()
      setSelectedSessionUpdateRequest(null)
      toast({
        title: status === 'approved' ? 'Session update approved' : 'Session update denied',
      })
    } catch (error) {
      toast({
        title: 'Review failed',
        description:
          error instanceof Error ? error.message : 'Failed to review the session update request.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
          <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
          <p className="text-sm text-muted-foreground">{content.description}</p>
        </div>

        {view === 'reschedule-requests' ? (
          <Tabs
            value={activeRescheduleStatus}
            onValueChange={(value) => setActiveRescheduleStatus(value as ApprovalRequestStatus)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="denied">Denied</TabsTrigger>
            </TabsList>

            <TabsContent value={activeRescheduleStatus} className="space-y-4">
              {rescheduleRequestsQuery.isLoading ? (
                <>
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </>
              ) : rescheduleRequestsQuery.error ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-destructive">
                      {rescheduleRequestsQuery.error instanceof Error
                        ? rescheduleRequestsQuery.error.message
                        : 'Failed to load reschedule requests.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <ApprovalGroup
                  title={rescheduleTabLabels[activeRescheduleStatus]}
                  emptyLabel={rescheduleEmptyLabels[activeRescheduleStatus]}
                  requests={rescheduleRequestsQuery.requests}
                  onReview={
                    activeRescheduleStatus === 'pending'
                      ? handleOpenRescheduleReview
                      : undefined
                  }
                />
              )}
            </TabsContent>
          </Tabs>
        ) : sessionUpdateRequestsQuery.isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : sessionUpdateRequestsQuery.error ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-destructive">
                {sessionUpdateRequestsQuery.error instanceof Error
                  ? sessionUpdateRequestsQuery.error.message
                  : 'Failed to load session update requests.'}
              </p>
            </CardContent>
          </Card>
        ) : sessionUpdateRequestsQuery.requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No pending session updates.
            </CardContent>
          </Card>
        ) : (
          sessionUpdateRequestsQuery.requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold">
                      {request.trainerName ?? request.requestedByName}
                    </p>
                    <span className="text-muted-foreground">→</span>
                    <p className="text-lg font-semibold">
                      {request.memberName ?? 'Unknown member'}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {request.sessionScheduledAt
                      ? formatPtSessionDateTime(request.sessionScheduledAt)
                      : 'Session time unavailable'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {formatPtSessionStatusLabel(request.requestedStatus)}
                    </Badge>
                    <Badge variant="outline">Pending</Badge>
                  </div>
                  <p className="text-sm">{request.note ?? 'No note'}</p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenSessionUpdateReview(request)}
                >
                  Review
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {view === 'reschedule-requests' ? (
        <Dialog
          open={Boolean(selectedRescheduleRequest)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRescheduleRequest(null)
              setApprovedTimeValidationMessage(null)
            }
          }}
        >
          <DialogContent isLoading={isSubmittingReview}>
            <DialogHeader>
              <DialogTitle>Review Reschedule Request</DialogTitle>
              <DialogDescription>
                Review the trainer&apos;s proposed time and approve or deny the request.
              </DialogDescription>
            </DialogHeader>

            {selectedRescheduleRequest ? (
              <div className="space-y-4">
                <ReadOnlyField
                  label="Trainer"
                  value={
                    selectedRescheduleRequest.trainerName ??
                    selectedRescheduleRequest.requestedByName
                  }
                />
                <ReadOnlyField
                  label="Member"
                  value={selectedRescheduleRequest.memberName ?? 'Unknown member'}
                />
                <ReadOnlyField
                  label="Original time"
                  value={
                    selectedRescheduleRequest.sessionScheduledAt
                      ? formatPtSessionDateTime(selectedRescheduleRequest.sessionScheduledAt)
                      : 'Unavailable'
                  }
                />
                <ReadOnlyField
                  label="Proposed time"
                  value={formatPtSessionDateTime(selectedRescheduleRequest.proposedAt)}
                />
                <ReadOnlyField
                  label="Trainer note"
                  value={selectedRescheduleRequest.note ?? 'No note'}
                />

                <div className="space-y-2">
                  <Label htmlFor="approved-time">Approved time</Label>
                  <RescheduleDateTimePicker
                    key={selectedRescheduleRequest.id}
                    id="approved-time"
                    value={approvedTime}
                    onValueChange={setApprovedTime}
                    onValidationChange={setApprovedTimeValidationMessage}
                    placeholder="Select an approved date and time"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="review-note">Reason / Note</Label>
                  <Textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedRescheduleRequest(null)}
                disabled={isSubmittingReview}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleReviewRescheduleRequest('denied')}
                disabled={isSubmittingReview}
                loading={isSubmittingReview}
              >
                Deny
              </Button>
              <Button
                type="button"
                onClick={() => void handleReviewRescheduleRequest('approved')}
                disabled={
                  isSubmittingReview ||
                  !approvedTime ||
                  Boolean(approvedTimeValidationMessage)
                }
                loading={isSubmittingReview}
              >
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Dialog
          open={Boolean(selectedSessionUpdateRequest)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedSessionUpdateRequest(null)
            }
          }}
        >
          <DialogContent isLoading={isSubmittingReview}>
            <DialogHeader>
              <DialogTitle>Review Session Update</DialogTitle>
              <DialogDescription>
                Approve or deny the trainer&apos;s requested session status change.
              </DialogDescription>
            </DialogHeader>

            {selectedSessionUpdateRequest ? (
              <div className="space-y-4">
                <ReadOnlyField
                  label="Trainer"
                  value={
                    selectedSessionUpdateRequest.trainerName ??
                    selectedSessionUpdateRequest.requestedByName
                  }
                />
                <ReadOnlyField
                  label="Member"
                  value={selectedSessionUpdateRequest.memberName ?? 'Unknown member'}
                />
                <ReadOnlyField
                  label="Session time"
                  value={
                    selectedSessionUpdateRequest.sessionScheduledAt
                      ? formatPtSessionDateTime(selectedSessionUpdateRequest.sessionScheduledAt)
                      : 'Unavailable'
                  }
                />
                <ReadOnlyField
                  label="Requested status"
                  value={formatPtSessionStatusLabel(selectedSessionUpdateRequest.requestedStatus)}
                />
                <ReadOnlyField
                  label="Trainer note"
                  value={selectedSessionUpdateRequest.note ?? 'No note'}
                />

                <div className="space-y-2">
                  <Label htmlFor="session-update-review-note">Reason / Note</Label>
                  <Textarea
                    id="session-update-review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedSessionUpdateRequest(null)}
                disabled={isSubmittingReview}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleReviewSessionUpdateRequest('denied')}
                disabled={isSubmittingReview}
                loading={isSubmittingReview}
              >
                Deny
              </Button>
              <Button
                type="button"
                onClick={() => void handleReviewSessionUpdateRequest('approved')}
                disabled={isSubmittingReview}
                loading={isSubmittingReview}
              >
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function ApprovalGroup({
  title,
  emptyLabel,
  requests,
  onReview,
}: {
  title: string
  emptyLabel: string
  requests: RescheduleRequest[]
  onReview?: (request: RescheduleRequest) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{emptyLabel}</CardContent>
        </Card>
      ) : (
        requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold">
                    {request.trainerName ?? request.requestedByName}
                  </p>
                  <span className="text-muted-foreground">→</span>
                  <p className="text-lg font-semibold">{request.memberName ?? 'Unknown member'}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {request.sessionScheduledAt
                    ? formatPtSessionDateTime(request.sessionScheduledAt)
                    : 'Session time unavailable'}{' '}
                  → {formatPtSessionDateTime(request.proposedAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{request.status}</Badge>
                </div>
                <p className="text-sm">{request.note ?? 'No note'}</p>
              </div>

              {request.status === 'pending' && onReview ? (
                <Button type="button" variant="outline" onClick={() => onReview(request)}>
                  Review
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </section>
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
