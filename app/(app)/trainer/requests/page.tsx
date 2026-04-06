'use client'

import { useMemo } from 'react'
import { StaffOnly } from '@/components/staff-only'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/auth-context'
import {
  useMyRescheduleRequests,
  useMySessionUpdateRequests,
} from '@/hooks/use-pt-scheduling'
import {
  formatPtSessionDateTime,
  formatPtSessionStatusLabel,
  type ApprovalRequestStatus,
  type RescheduleRequest,
  type SessionUpdateRequest,
} from '@/lib/pt-scheduling'

function getRequestStatusBadgeClassName(status: ApprovalRequestStatus) {
  if (status === 'approved') {
    return 'bg-green-500/15 text-green-700 hover:bg-green-500/25'
  }

  if (status === 'denied') {
    return 'bg-red-500/15 text-red-700 hover:bg-red-500/25'
  }

  return 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25'
}

function formatRequestStatusLabel(status: ApprovalRequestStatus) {
  if (status === 'approved') {
    return 'Approved'
  }

  if (status === 'denied') {
    return 'Denied'
  }

  return 'Pending'
}

function RequestStatusBadge({ status }: { status: ApprovalRequestStatus }) {
  return (
    <Badge variant="secondary" className={getRequestStatusBadgeClassName(status)}>
      {formatRequestStatusLabel(status)}
    </Badge>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  )
}

function RescheduleRequestRow({ request }: { request: RescheduleRequest }) {
  return (
    <Card key={request.id}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-lg font-semibold">{request.memberName ?? 'Unknown member'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Original session"
                value={
                  request.sessionScheduledAt
                    ? formatPtSessionDateTime(request.sessionScheduledAt)
                    : 'Unavailable'
                }
              />
              <DetailRow
                label="Proposed session"
                value={formatPtSessionDateTime(request.proposedAt)}
              />
              <DetailRow
                label="Submitted"
                value={formatPtSessionDateTime(request.createdAt)}
              />
            </div>
          </div>

          <RequestStatusBadge status={request.status} />
        </div>

        {request.note ? <p className="text-sm text-muted-foreground">{request.note}</p> : null}
        {request.status === 'denied' && request.reviewNote ? (
          <p className="text-sm">
            <span className="font-medium">Reason:</span> {request.reviewNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SessionUpdateRequestRow({ request }: { request: SessionUpdateRequest }) {
  return (
    <Card key={request.id}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-lg font-semibold">{request.memberName ?? 'Unknown member'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Original session"
                value={
                  request.sessionScheduledAt
                    ? formatPtSessionDateTime(request.sessionScheduledAt)
                    : 'Unavailable'
                }
              />
              <DetailRow
                label="Requested status"
                value={formatPtSessionStatusLabel(request.requestedStatus)}
              />
              <DetailRow
                label="Submitted"
                value={formatPtSessionDateTime(request.createdAt)}
              />
            </div>
          </div>

          <RequestStatusBadge status={request.status} />
        </div>

        {request.note ? <p className="text-sm text-muted-foreground">{request.note}</p> : null}
        {request.status === 'denied' && request.reviewNote ? (
          <p className="text-sm">
            <span className="font-medium">Reason:</span> {request.reviewNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TrainerRequestsContent() {
  const { profile } = useAuth()
  const profileId = profile?.id ?? ''
  const rescheduleRequestsQuery = useMyRescheduleRequests(profileId)
  const sessionUpdateRequestsQuery = useMySessionUpdateRequests(profileId)

  const sessionUpdateRequests = useMemo(
    () =>
      sessionUpdateRequestsQuery.requests.filter(
        (request) => request.requestedStatus === 'completed' || request.requestedStatus === 'missed',
      ),
    [sessionUpdateRequestsQuery.requests],
  )
  const cancellationRequests = useMemo(
    () =>
      sessionUpdateRequestsQuery.requests.filter(
        (request) => request.requestedStatus === 'cancelled',
      ),
    [sessionUpdateRequestsQuery.requests],
  )
  const sessionUpdateError =
    sessionUpdateRequestsQuery.error instanceof Error
      ? sessionUpdateRequestsQuery.error.message
      : 'Failed to load session update requests.'
  const rescheduleError =
    rescheduleRequestsQuery.error instanceof Error
      ? rescheduleRequestsQuery.error.message
      : 'Failed to load reschedule requests.'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Requests</h1>
        <p className="text-sm text-muted-foreground">
          Submitted reschedule, session update, and cancellation requests.
        </p>
      </div>

      <Tabs defaultValue="reschedules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reschedules">Reschedules</TabsTrigger>
          <TabsTrigger value="session-updates">Session Updates</TabsTrigger>
          <TabsTrigger value="cancellations">Cancellations</TabsTrigger>
        </TabsList>

        <TabsContent value="reschedules" className="space-y-4">
          {rescheduleRequestsQuery.isLoading ? (
            <LoadingState />
          ) : rescheduleRequestsQuery.error ? (
            <ErrorState message={rescheduleError} />
          ) : rescheduleRequestsQuery.requests.length === 0 ? (
            <EmptyState label="No reschedule requests submitted." />
          ) : (
            rescheduleRequestsQuery.requests.map((request) => (
              <RescheduleRequestRow key={request.id} request={request} />
            ))
          )}
        </TabsContent>

        <TabsContent value="session-updates" className="space-y-4">
          {sessionUpdateRequestsQuery.isLoading ? (
            <LoadingState />
          ) : sessionUpdateRequestsQuery.error ? (
            <ErrorState message={sessionUpdateError} />
          ) : sessionUpdateRequests.length === 0 ? (
            <EmptyState label="No session update requests submitted." />
          ) : (
            sessionUpdateRequests.map((request) => (
              <SessionUpdateRequestRow key={request.id} request={request} />
            ))
          )}
        </TabsContent>

        <TabsContent value="cancellations" className="space-y-4">
          {sessionUpdateRequestsQuery.isLoading ? (
            <LoadingState />
          ) : sessionUpdateRequestsQuery.error ? (
            <ErrorState message={sessionUpdateError} />
          ) : cancellationRequests.length === 0 ? (
            <EmptyState label="No cancellation requests submitted." />
          ) : (
            cancellationRequests.map((request) => (
              <SessionUpdateRequestRow key={request.id} request={request} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function TrainerRequestsPage() {
  return (
    <StaffOnly>
      <TrainerRequestsContent />
    </StaffOnly>
  )
}
