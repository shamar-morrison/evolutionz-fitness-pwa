'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EllipsisVertical } from 'lucide-react'
import { MemberAvatar } from '@/components/member-avatar'
import { PaginationControls } from '@/components/pagination-controls'
import { RescheduleDateTimePicker } from '@/components/reschedule-date-time-picker'
import { StaffOnly } from '@/components/staff-only'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/auth-context'
import { toast } from '@/hooks/use-toast'
import {
  createPtRescheduleRequest,
  fetchPtSessions,
  formatPtSessionDateTime,
  formatPtSessionDateTimeInputValue,
  formatPtSessionStatusLabel,
  getJamaicaDateValue,
  getPtSessionStatusBadgeClassName,
  markPtSession,
  type PtSession,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

const TWO_MINUTES_MS = 2 * 60 * 1000
const PAST_PAGE_SIZE = 10
const PENDING_APPROVAL_BADGE_CLASSNAME =
  'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'

type TrainerScheduleTab = 'upcoming' | 'today' | 'past'
type SessionPendingAction = 'completed' | 'missed' | 'cancelled' | 'reschedule'

function sortAscending(left: PtSession, right: PtSession) {
  return new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
}

function sortDescending(left: PtSession, right: PtSession) {
  return new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime()
}

function getTodayDateValue() {
  return getJamaicaDateValue(new Date().toISOString())
}

function getEmptyStateLabel(tab: TrainerScheduleTab) {
  if (tab === 'today') {
    return 'No sessions today.'
  }

  if (tab === 'past') {
    return 'No past sessions.'
  }

  return 'No upcoming sessions.'
}

function getSessionPendingActionLabel(action: SessionPendingAction) {
  return action === 'completed' || action === 'missed'
    ? 'Updating session...'
    : 'Submitting request...'
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">{value}</div>
    </div>
  )
}

function ScheduleContent() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<TrainerScheduleTab>('upcoming')
  const [pastPage, setPastPage] = useState(0)
  const [selectedRescheduleSession, setSelectedRescheduleSession] = useState<PtSession | null>(null)
  const [selectedCancellationSession, setSelectedCancellationSession] = useState<PtSession | null>(
    null,
  )
  const [rescheduleDateTime, setRescheduleDateTime] = useState('')
  const [rescheduleValidationMessage, setRescheduleValidationMessage] = useState<string | null>(
    null,
  )
  const [rescheduleNote, setRescheduleNote] = useState('')
  const [cancellationReason, setCancellationReason] = useState('')
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false)
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false)
  const [pendingActionBySessionId, setPendingActionBySessionId] = useState<
    Partial<Record<string, SessionPendingAction>>
  >({})
  const trainerId = profile?.id ?? ''

  const upcomingQuery = useQuery({
    queryKey: queryKeys.ptScheduling.sessions({ trainerId, tab: 'upcoming' }),
    queryFn: async () => {
      const sessions = await fetchPtSessions({ trainerId })
      const now = Date.now()

      return sessions
        .filter(
          (session) =>
            session.status === 'scheduled' &&
            new Date(session.scheduledAt).getTime() >= now,
        )
        .sort(sortAscending)
    },
    enabled: Boolean(trainerId) && activeTab === 'upcoming',
    staleTime: TWO_MINUTES_MS,
  })

  const todayQuery = useQuery({
    queryKey: queryKeys.ptScheduling.sessions({ trainerId, tab: 'today' }),
    queryFn: async () => {
      const sessions = await fetchPtSessions({ trainerId })
      const todayDateValue = getTodayDateValue()

      return sessions
        .filter((session) => getJamaicaDateValue(session.scheduledAt) === todayDateValue)
        .sort(sortAscending)
    },
    enabled: Boolean(trainerId) && activeTab === 'today',
    staleTime: TWO_MINUTES_MS,
  })

  const pastQuery = useQuery({
    queryKey: queryKeys.ptScheduling.sessions({ trainerId, tab: 'past' }),
    queryFn: async () => {
      const sessions = await fetchPtSessions({ trainerId, past: 'true' })

      return sessions.sort(sortDescending)
    },
    enabled: Boolean(trainerId) && activeTab === 'past',
    staleTime: TWO_MINUTES_MS,
  })

  const activeQuery =
    activeTab === 'upcoming' ? upcomingQuery : activeTab === 'today' ? todayQuery : pastQuery

  const paginatedPastSessions = useMemo(() => {
    if (activeTab !== 'past') {
      return []
    }

    const sessions = pastQuery.data ?? []
    const startIndex = pastPage * PAST_PAGE_SIZE

    return sessions.slice(startIndex, startIndex + PAST_PAGE_SIZE)
  }, [activeTab, pastPage, pastQuery.data])

  useEffect(() => {
    setPastPage(0)
  }, [activeTab])

  const visibleSessions =
    activeTab === 'past' ? paginatedPastSessions : (activeQuery.data ?? [])

  const totalPastPages = Math.max(
    Math.ceil(((pastQuery.data ?? []).length || 0) / PAST_PAGE_SIZE),
    1,
  )

  const invalidateTrainerWorkspaceQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.ptScheduling.sessions({}),
        exact: false,
      }),
      trainerId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.rescheduleRequests.mine(trainerId),
          })
        : Promise.resolve(),
      trainerId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.sessionUpdateRequests.mine(trainerId),
          })
        : Promise.resolve(),
    ])
  }

  const runSessionAction = async <TResult,>(
    sessionId: string,
    pendingAction: SessionPendingAction,
    action: () => Promise<TResult>,
  ) => {
    setPendingActionBySessionId((current) => ({
      ...current,
      [sessionId]: pendingAction,
    }))

    try {
      return await action()
    } finally {
      setPendingActionBySessionId((current) => {
        if (!(sessionId in current)) {
          return current
        }

        const next = { ...current }
        delete next[sessionId]
        return next
      })
    }
  }

  const handleMarkSession = async (
    session: PtSession,
    requestedStatus: 'completed' | 'missed',
  ) => {
    try {
      const result = await runSessionAction(session.id, requestedStatus, async () => {
        const nextResult = await markPtSession(session.id, { requestedStatus })
        await invalidateTrainerWorkspaceQueries()
        return nextResult
      })

      if ('pending' in result && result.pending) {
        toast({
          title: 'Request submitted — pending admin approval.',
        })
      } else {
        toast({
          title: 'Session updated',
          description: `The session was marked ${requestedStatus}.`,
        })
      }
    } catch (error) {
      toast({
        title: 'Unable to mark session',
        description:
          error instanceof Error ? error.message : 'Failed to update the session.',
        variant: 'destructive',
      })
    }
  }

  const handleOpenReschedule = (session: PtSession) => {
    setSelectedRescheduleSession(session)
    setRescheduleDateTime(formatPtSessionDateTimeInputValue(session.scheduledAt))
    setRescheduleValidationMessage(null)
    setRescheduleNote('')
  }

  const handleOpenCancellation = (session: PtSession) => {
    setSelectedCancellationSession(session)
    setCancellationReason('')
  }

  const handleSubmitReschedule = async () => {
    if (!selectedRescheduleSession || !rescheduleDateTime || rescheduleValidationMessage) {
      return
    }

    const sessionId = selectedRescheduleSession.id
    setIsSubmittingReschedule(true)

    try {
      await runSessionAction(sessionId, 'reschedule', async () => {
        await createPtRescheduleRequest(sessionId, {
          proposedAt: rescheduleDateTime,
          note: rescheduleNote.trim() || null,
        })
        await invalidateTrainerWorkspaceQueries()
      })
      setSelectedRescheduleSession(null)
      toast({
        title: 'Request submitted — pending admin approval.',
      })
    } catch (error) {
      toast({
        title: 'Unable to request reschedule',
        description:
          error instanceof Error ? error.message : 'Failed to create the reschedule request.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingReschedule(false)
    }
  }

  const handleSubmitCancellation = async () => {
    const note = cancellationReason.trim()

    if (!selectedCancellationSession || !note) {
      return
    }

    const sessionId = selectedCancellationSession.id
    setIsSubmittingCancellation(true)

    try {
      const result = await runSessionAction(sessionId, 'cancelled', async () => {
        const nextResult = await markPtSession(sessionId, {
          requestedStatus: 'cancelled',
          note,
        })
        await invalidateTrainerWorkspaceQueries()
        return nextResult
      })

      if ('pending' in result && result.pending) {
        setSelectedCancellationSession(null)
        setCancellationReason('')
        toast({
          title: 'Request submitted — pending admin approval.',
        })
      } else {
        setSelectedCancellationSession(null)
        setCancellationReason('')
        toast({
          title: 'Session updated',
          description: 'The session was marked cancelled.',
        })
      }
    } catch (error) {
      toast({
        title: 'Unable to mark session',
        description:
          error instanceof Error ? error.message : 'Failed to update the session.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingCancellation(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Schedule</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.name ?? 'Trainer'} • Upcoming sessions, today&apos;s activity, and past records.
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TrainerScheduleTab)}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {activeQuery.isLoading ? (
              <>
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
              </>
            ) : activeQuery.error ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-destructive">
                    {activeQuery.error instanceof Error
                      ? activeQuery.error.message
                      : 'Failed to load the trainer schedule.'}
                  </p>
                </CardContent>
              </Card>
            ) : visibleSessions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  {getEmptyStateLabel(activeTab)}
                </CardContent>
              </Card>
            ) : (
              visibleSessions.map((session) => {
                const hasPendingRequest = session.pendingRequestType !== null
                const pendingAction = pendingActionBySessionId[session.id] ?? null
                const isSessionPending = pendingAction !== null
                const showMarkAction =
                  (activeTab === 'upcoming' || activeTab === 'today') && !hasPendingRequest
                const showRescheduleAction = activeTab === 'upcoming' && !hasPendingRequest

                return (
                  <Card
                    key={session.id}
                    className="relative overflow-hidden"
                    data-session-id={session.id}
                    data-session-loading={isSessionPending ? 'true' : 'false'}
                    aria-busy={isSessionPending}
                  >
                    <CardContent
                      className={cn(
                        'flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between',
                        isSessionPending ? 'opacity-60' : undefined,
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <MemberAvatar
                          name={session.memberName ?? 'Member'}
                          photoUrl={session.memberPhotoUrl ?? null}
                          size="lg"
                        />
                        <div className="space-y-2">
                          <div>
                            <p className="text-lg font-semibold">
                              {session.memberName ?? 'Unknown member'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatPtSessionDateTime(session.scheduledAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {session.trainingTypeName ?? 'Not set'}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={getPtSessionStatusBadgeClassName(session.status)}
                            >
                              {formatPtSessionStatusLabel(session.status)}
                            </Badge>
                            {hasPendingRequest ? (
                              <Badge
                                variant="outline"
                                className={PENDING_APPROVAL_BADGE_CLASSNAME}
                              >
                                Pending approval
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {showMarkAction ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" disabled={isSessionPending}>
                                <EllipsisVertical className="h-4 w-4" />
                                Mark Session
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={isSessionPending}
                                onClick={() => void handleMarkSession(session, 'completed')}
                              >
                                Completed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isSessionPending}
                                onClick={() => void handleMarkSession(session, 'missed')}
                              >
                                Missed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isSessionPending}
                                onClick={() => handleOpenCancellation(session)}
                              >
                                Cancelled
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}

                        {showRescheduleAction ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSessionPending}
                            onClick={() => handleOpenReschedule(session)}
                          >
                            Request Reschedule
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>

                    {pendingAction ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75">
                        <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-sm">
                          <Spinner />
                          <span className="text-sm font-medium">
                            {getSessionPendingActionLabel(pendingAction)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                )
              })
            )}

            {activeTab === 'past' && (pastQuery.data ?? []).length > PAST_PAGE_SIZE ? (
              <div className="flex justify-end">
                <PaginationControls
                  currentPage={pastPage}
                  totalPages={totalPastPages}
                  onPageChange={setPastPage}
                />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={Boolean(selectedRescheduleSession)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRescheduleSession(null)
            setRescheduleValidationMessage(null)
          }
        }}
      >
        <DialogContent isLoading={isSubmittingReschedule}>
          <DialogHeader>
            <DialogTitle>Request Reschedule</DialogTitle>
            <DialogDescription>
              Propose a new date and time for this PT session. An admin must approve it before the
              schedule changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trainer-reschedule-at">Proposed time</Label>
              <RescheduleDateTimePicker
                key={selectedRescheduleSession?.id ?? 'trainer-reschedule'}
                id="trainer-reschedule-at"
                value={rescheduleDateTime}
                onValueChange={setRescheduleDateTime}
                onValidationChange={setRescheduleValidationMessage}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trainer-reschedule-note">Note</Label>
              <Textarea
                id="trainer-reschedule-note"
                value={rescheduleNote}
                onChange={(event) => setRescheduleNote(event.target.value)}
                placeholder="Optional context for the admin."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedRescheduleSession(null)}
              disabled={isSubmittingReschedule}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitReschedule()}
              disabled={
                isSubmittingReschedule ||
                !rescheduleDateTime ||
                Boolean(rescheduleValidationMessage)
              }
              loading={isSubmittingReschedule}
            >
              {isSubmittingReschedule ? 'Sending...' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedCancellationSession)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCancellationSession(null)
          }
        }}
      >
        <DialogContent isLoading={isSubmittingCancellation}>
          <DialogHeader>
            <DialogTitle>Cancel Session</DialogTitle>
            <DialogDescription>
              Submit a cancellation request for admin approval.
            </DialogDescription>
          </DialogHeader>

          {selectedCancellationSession ? (
            <div className="space-y-4">
              <ReadOnlyField
                label="Member"
                value={selectedCancellationSession.memberName ?? 'Unknown member'}
              />
              <ReadOnlyField
                label="Session"
                value={formatPtSessionDateTime(selectedCancellationSession.scheduledAt)}
              />

              <div className="space-y-2">
                <Label htmlFor="trainer-cancellation-reason">Reason</Label>
                <Textarea
                  id="trainer-cancellation-reason"
                  value={cancellationReason}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  placeholder="Provide a reason for cancelling this session"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedCancellationSession(null)}
              disabled={isSubmittingCancellation}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitCancellation()}
              disabled={isSubmittingCancellation || !cancellationReason.trim()}
              loading={isSubmittingCancellation}
            >
              {isSubmittingCancellation ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function TrainerSchedulePage() {
  return (
    <StaffOnly>
      <ScheduleContent />
    </StaffOnly>
  )
}
