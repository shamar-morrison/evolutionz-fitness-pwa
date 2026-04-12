'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ClipboardCheck } from 'lucide-react'
import { useMemberEditRequests } from '@/hooks/use-member-edit-requests'
import { toast } from '@/hooks/use-toast'
import { reviewMemberEditRequest } from '@/lib/member-edit-requests'
import {
  buildEndTimeValue,
  calculateInclusiveEndDate,
  findMatchingMemberDuration,
  formatAccessDate,
  getAccessDateInputValue,
  getAccessTimeInputValue,
  getMemberDurationLabel,
  getMemberDurationValueFromLabel,
} from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import type { MemberEditRequest } from '@/types'
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

type EditChange = {
  label: string
  from: string
  to: string
}

const MEMBER_TYPE_EMPTY_LABEL = 'Not set'
const FIELD_EMPTY_LABEL = 'Blank'

function formatRequestTimestamp(value: string) {
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatFieldValue(value: string | null | undefined, emptyLabel = FIELD_EMPTY_LABEL) {
  return value && value.trim() ? value.trim() : emptyLabel
}

function formatGender(value: MemberEditRequest['currentGender']) {
  return value ?? FIELD_EMPTY_LABEL
}

function buildAccessWindowChanges(request: MemberEditRequest): EditChange[] {
  const hasAccessWindowChange =
    request.proposedStartDate !== null ||
    request.proposedStartTime !== null ||
    request.proposedDuration !== null

  if (!hasAccessWindowChange) {
    return []
  }

  const currentStartDate = getAccessDateInputValue(request.currentBeginTime)
  const currentStartTime = getAccessTimeInputValue(request.currentBeginTime)
  const currentDurationValue = findMatchingMemberDuration(
    request.currentBeginTime,
    request.currentEndTime,
  )
  const currentDurationLabel = getMemberDurationLabel(currentDurationValue)
  const nextStartDate = request.proposedStartDate ?? currentStartDate
  const nextStartTime = request.proposedStartTime ?? currentStartTime
  const nextDurationValue =
    request.proposedDuration !== null
      ? getMemberDurationValueFromLabel(request.proposedDuration)
      : currentDurationValue
  const nextDurationLabel = request.proposedDuration ?? currentDurationLabel
  const nextEndDate =
    nextStartDate && nextDurationValue
      ? calculateInclusiveEndDate(nextStartDate, nextDurationValue)
      : null
  const nextEndTime = nextEndDate ? buildEndTimeValue(nextEndDate) : null

  return [
    {
      label: 'Start Date',
      from: formatAccessDate(request.currentBeginTime, 'long'),
      to: nextStartDate ? formatAccessDate(`${nextStartDate}T00:00:00`, 'long') : FIELD_EMPTY_LABEL,
    },
    {
      label: 'Start Time',
      from: formatFieldValue(currentStartTime),
      to: formatFieldValue(nextStartTime),
    },
    {
      label: 'Duration',
      from: formatFieldValue(currentDurationLabel),
      to: formatFieldValue(nextDurationLabel),
    },
    {
      label: 'End Date',
      from: formatAccessDate(request.currentEndTime, 'long'),
      to: nextEndTime ? formatAccessDate(nextEndTime, 'long') : 'Unavailable',
    },
  ]
}

function buildEditChanges(request: MemberEditRequest): EditChange[] {
  const changes: EditChange[] = []

  if (request.proposedName !== null) {
    changes.push({
      label: 'Name',
      from: formatFieldValue(request.currentName),
      to: formatFieldValue(request.proposedName),
    })
  }

  if (request.proposedGender !== null) {
    changes.push({
      label: 'Gender',
      from: formatGender(request.currentGender),
      to: formatGender(request.proposedGender),
    })
  }

  if (request.proposedEmail !== null) {
    changes.push({
      label: 'Email',
      from: formatFieldValue(request.currentEmail),
      to: formatFieldValue(request.proposedEmail),
    })
  }

  if (request.proposedPhone !== null) {
    changes.push({
      label: 'Phone',
      from: formatFieldValue(request.currentPhone),
      to: formatFieldValue(request.proposedPhone),
    })
  }

  if (request.proposedMemberTypeId !== null) {
    changes.push({
      label: 'Membership Type',
      from: formatFieldValue(request.currentMemberTypeName, MEMBER_TYPE_EMPTY_LABEL),
      to: formatFieldValue(request.proposedMemberTypeName, MEMBER_TYPE_EMPTY_LABEL),
    })
  }

  return [...changes, ...buildAccessWindowChanges(request)]
}

export function PendingMemberEditRequestsPage() {
  const queryClient = useQueryClient()
  const { requests, isLoading, error } = useMemberEditRequests()
  const [hiddenRequestIds, setHiddenRequestIds] = useState<string[]>([])
  const [denyRequest, setDenyRequest] = useState<MemberEditRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null)
  const visibleRequests = useMemo(
    () => requests.filter((request) => !hiddenRequestIds.includes(request.id)),
    [hiddenRequestIds, requests],
  )

  const reviewRequest = async (
    request: MemberEditRequest,
    action: 'approve' | 'deny',
    nextRejectionReason?: string | null,
  ) => {
    setReviewingRequestId(request.id)
    setHiddenRequestIds((current) => (current.includes(request.id) ? current : [...current, request.id]))

    try {
      await reviewMemberEditRequest(request.id, {
        action,
        rejectionReason: nextRejectionReason ?? null,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.memberEditRequests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberEditRequests.pending }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(request.memberId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
      ])
      toast({
        title: action === 'approve' ? 'Edit request approved' : 'Edit request denied',
      })
    } catch (error) {
      setHiddenRequestIds((current) => current.filter((id) => id !== request.id))
      toast({
        title: 'Review failed',
        description:
          error instanceof Error ? error.message : 'Failed to review the member edit request.',
        variant: 'destructive',
      })
    } finally {
      setReviewingRequestId(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
          <h1 className="text-3xl font-bold tracking-tight">Edit Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review member profile and access window changes submitted by front desk staff.
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
                {error instanceof Error ? error.message : 'Failed to load member edit requests.'}
              </p>
            </CardContent>
          </Card>
        ) : visibleRequests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No pending edit requests.
            </CardContent>
          </Card>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Pending</h2>
            </div>

            {visibleRequests.map((request) => {
              const changes = buildEditChanges(request)
              const isReviewing = reviewingRequestId === request.id

              return (
                <Card key={request.id}>
                  <CardContent className="flex flex-col gap-4 p-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold">{request.memberName}</h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>Requested by: {request.requestedByName ?? 'Unknown staff'}</span>
                          <span>Submitted: {formatRequestTimestamp(request.createdAt)}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Proposed Changes</p>
                        <div className="space-y-2">
                          {changes.map((change) => (
                            <div
                              key={change.label}
                              className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                            >
                              <p className="font-medium">{change.label}</p>
                              <p className="text-muted-foreground">
                                {change.from} {'->'} {change.to}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button
                        type="button"
                        onClick={() => void reviewRequest(request, 'approve')}
                        disabled={isReviewing}
                      >
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
            <DialogTitle>Deny edit request?</DialogTitle>
            <DialogDescription>
              Add an optional rejection reason before denying this member edit request.
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
              disabled={denyRequest !== null && reviewingRequestId === denyRequest.id}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={denyRequest !== null && reviewingRequestId === denyRequest.id}
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
    </>
  )
}
