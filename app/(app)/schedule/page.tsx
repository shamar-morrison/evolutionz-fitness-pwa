'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarDays, WandSparkles } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PtSessionDialog } from '@/components/pt-session-dialog'
import { RoleGuard } from '@/components/role-guard'
import { SearchableSelect } from '@/components/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { usePtAssignments, usePtSessions } from '@/hooks/use-pt-scheduling'
import { useStaff } from '@/hooks/use-staff'
import { toast } from '@/hooks/use-toast'
import {
  formatPtSessionStatusLabel,
  formatScheduleSummary,
  generatePtAssignmentSessions,
  getJamaicaDateValue,
  getMonthDateValues,
  getMonthLabel,
  getMonthValueInJamaica,
  getPtSessionStatusBadgeClassName,
  parseMonthValue,
  SESSION_STATUSES,
  type PtSessionFilterStatus,
  type SessionStatus,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { hasStaffTitle } from '@/lib/staff'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function formatPtSessionTime(value: string) {
  return new Intl.DateTimeFormat('en-JM', {
    timeZone: 'America/Jamaica',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function getUtcDateValue(value: string) {
  const date = new Date(`${value}T12:00:00Z`)

  return Number.isNaN(date.getTime()) ? null : date
}

function shiftDateValue(value: string, offsetDays: number) {
  const date = getUtcDateValue(value)

  if (!date) {
    return value
  }

  date.setUTCDate(date.getUTCDate() + offsetDays)

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

function getCalendarCells(monthValue: string) {
  const parts = parseMonthValue(monthValue)

  if (!parts) {
    return []
  }

  const monthDates = getMonthDateValues(parts.month, parts.year)

  if (monthDates.length === 0) {
    return []
  }

  const firstDate = getUtcDateValue(monthDates[0])
  const lastDate = getUtcDateValue(monthDates[monthDates.length - 1])

  if (!firstDate || !lastDate) {
    return []
  }

  const leadingCount = (firstDate.getUTCDay() + 6) % 7
  const trailingCount = (7 - ((leadingCount + monthDates.length) % 7 || 7)) % 7
  const leadingCells = Array.from({ length: leadingCount }, (_, index) => ({
    dateValue: shiftDateValue(monthDates[0], index - leadingCount),
    isCurrentMonth: false,
  }))
  const currentMonthCells = monthDates.map((dateValue) => ({
    dateValue,
    isCurrentMonth: true,
  }))
  const trailingCells = Array.from({ length: trailingCount }, (_, index) => ({
    dateValue: shiftDateValue(monthDates[monthDates.length - 1], index + 1),
    isCurrentMonth: false,
  }))

  return [...leadingCells, ...currentMonthCells, ...trailingCells]
}

function shiftMonthValue(monthValue: string, delta: number) {
  const parts = parseMonthValue(monthValue)

  if (!parts) {
    return monthValue
  }

  let nextMonth = parts.month + delta
  let nextYear = parts.year

  while (nextMonth < 1) {
    nextMonth += 12
    nextYear -= 1
  }

  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

function SchedulePageContent() {
  const queryClient = useQueryClient()
  const [monthValue, setMonthValue] = useState(() => getMonthValueInJamaica())
  const [trainerFilter, setTrainerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | PtSessionFilterStatus>('active')
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [generateAssignmentId, setGenerateAssignmentId] = useState<string | null>(null)
  const [generateMonthValue, setGenerateMonthValue] = useState(() => getMonthValueInJamaica())
  const [pendingOverride, setPendingOverride] = useState<{
    assignmentId: string
    month: number
    year: number
    weeks: string[]
  } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const monthParts = parseMonthValue(monthValue)
  const generateMonthParts = parseMonthValue(generateMonthValue)
  const calendarCells = useMemo(() => getCalendarCells(monthValue), [monthValue])
  const { sessions, isLoading, error } = usePtSessions({
    month: monthValue,
    trainerId: trainerFilter !== 'all' ? trainerFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })
  const { staff } = useStaff()
  const activeAssignmentsQuery = usePtAssignments({ status: 'active' })
  const trainerOptions = useMemo(
    () => staff.filter((profile) => hasStaffTitle(profile.titles, 'Trainer')),
    [staff],
  )
  const sessionsByDate = useMemo(() => {
    const groupedSessions = new Map<string, typeof sessions>()

    for (const session of sessions) {
      const dateValue = getJamaicaDateValue(session.scheduledAt)

      if (!dateValue) {
        continue
      }

      groupedSessions.set(dateValue, [...(groupedSessions.get(dateValue) ?? []), session])
    }

    return groupedSessions
  }, [sessions])

  const handleGenerate = async (override = false) => {
    if (!generateAssignmentId || !generateMonthParts) {
      toast({
        title: 'Assignment required',
        description: 'Choose an active assignment and month before generating sessions.',
        variant: 'destructive',
      })
      return
    }

    setIsGenerating(true)

    try {
      const result = await generatePtAssignmentSessions(generateAssignmentId, {
        month: generateMonthParts.month,
        year: generateMonthParts.year,
        ...(override ? { override: true } : {}),
      })

      if (!result.ok) {
        setPendingOverride({
          assignmentId: generateAssignmentId,
          month: generateMonthParts.month,
          year: generateMonthParts.year,
          weeks: result.weeks,
        })
        return
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.ptScheduling.sessions({}),
        exact: false,
      })
      setShowGenerateDialog(false)
      setGenerateAssignmentId(null)
      setPendingOverride(null)
      toast({
        title: 'Sessions generated',
        description: `${result.generated} session${result.generated === 1 ? '' : 's'} generated and ${result.skipped} skipped.`,
      })
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate PT sessions.',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
            <p className="text-muted-foreground text-sm">
              Monthly PT session calendar for admin scheduling and follow-up.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setMonthValue((current) => shiftMonthValue(current, -1))}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="min-w-[140px] text-center font-medium">
                {monthParts ? getMonthLabel(monthParts.month, monthParts.year) : monthValue}
              </div>
              <Button variant="outline" onClick={() => setMonthValue((current) => shiftMonthValue(current, 1))}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button onClick={() => setShowGenerateDialog(true)}>
              <WandSparkles className="h-4 w-4" />
              Generate Sessions
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schedule-trainer-filter">Trainer</Label>
              <Select value={trainerFilter} onValueChange={setTrainerFilter}>
                <SelectTrigger id="schedule-trainer-filter">
                  <SelectValue placeholder="All trainers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trainers</SelectItem>
                  {trainerOptions.map((trainer) => (
                    <SelectItem key={trainer.id} value={trainer.id}>
                      {trainer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-status-filter">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as 'all' | PtSessionFilterStatus)}
              >
                <SelectTrigger id="schedule-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Non-cancelled</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SESSION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatPtSessionStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b">
              {WEEKDAY_LABELS.map((weekday) => (
                <div key={weekday} className="bg-muted/40 p-3 text-center text-sm font-medium">
                  {weekday}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 p-6">
                <Skeleton className="h-[480px] w-full" />
              </div>
            ) : error ? (
              <div className="p-6">
                <p className="text-destructive text-sm">
                  {error instanceof Error ? error.message : 'Failed to load PT sessions.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-7">
                {calendarCells.map((cell) => {
                  const daySessions = sessionsByDate.get(cell.dateValue) ?? []

                  return (
                    <div
                      key={cell.dateValue}
                      className="min-h-[180px] border-b p-3 md:border-r"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span
                          className={
                            cell.isCurrentMonth
                              ? 'font-medium'
                              : 'text-muted-foreground text-sm'
                          }
                        >
                          {Number(cell.dateValue.slice(-2))}
                        </span>
                        {daySessions.length > 0 ? (
                          <Badge variant="outline">{daySessions.length}</Badge>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        {daySessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => setSelectedSessionId(session.id)}
                            className="bg-muted/40 hover:bg-muted flex w-full flex-col gap-1 rounded-md border p-2 text-left transition-colors"
                          >
                            <span className="truncate text-sm font-medium">
                              {session.memberName ?? 'Unknown member'}
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {session.trainerName ?? 'Unknown trainer'}
                            </span>
                            <span className="text-xs">{formatPtSessionTime(session.scheduledAt)}</span>
                            {session.trainingTypeName ? (
                              <span className="text-muted-foreground truncate text-xs">
                                {session.trainingTypeName}
                              </span>
                            ) : null}
                            <Badge
                              variant="secondary"
                              className={getPtSessionStatusBadgeClassName(session.status)}
                            >
                              {formatPtSessionStatusLabel(session.status)}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Generate Sessions</DialogTitle>
            <DialogDescription>
              Create recurring PT sessions for an active assignment and month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Assignment</Label>
              <SearchableSelect
                value={generateAssignmentId}
                onValueChange={setGenerateAssignmentId}
                options={(activeAssignmentsQuery.data ?? []).map((assignment) => ({
                  value: assignment.id,
                  label: `${assignment.memberName ?? 'Member'} <-> ${assignment.trainerName ?? 'Trainer'}`,
                  description: formatScheduleSummary(
                    assignment.scheduledDays,
                    assignment.sessionTime,
                    assignment.sessionsPerWeek,
                  ),
                  keywords: [assignment.memberName ?? '', assignment.trainerName ?? ''],
                }))}
                placeholder="Select an assignment"
                searchPlaceholder="Search assignments..."
                emptyMessage="No active assignments found."
                disabled={activeAssignmentsQuery.isLoading || isGenerating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="generate-month">Month</Label>
              <Input
                id="generate-month"
                type="month"
                value={generateMonthValue}
                onChange={(event) => setGenerateMonthValue(event.target.value)}
                disabled={isGenerating}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingOverride)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingOverride(null)
          }
        }}
        title="Override week limit?"
        description={
          pendingOverride
            ? `Some weeks would exceed 3 sessions (${pendingOverride.weeks.join(', ')}). Override and generate anyway?`
            : 'Some weeks would exceed 3 sessions. Override and generate anyway?'
        }
        confirmLabel="Override"
        cancelLabel="Cancel"
        onConfirm={() => void handleGenerate(true)}
        onCancel={() => setPendingOverride(null)}
        isLoading={isGenerating}
      />

      <PtSessionDialog
        sessionId={selectedSessionId}
        open={Boolean(selectedSessionId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSessionId(null)
          }
        }}
      />
    </>
  )
}

export default function SchedulePage() {
  return (
    <RoleGuard role="admin">
      <SchedulePageContent />
    </RoleGuard>
  )
}
