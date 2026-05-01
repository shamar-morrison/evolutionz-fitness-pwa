'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Trash2, WandSparkles } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PtSessionDialog } from '@/components/pt-session-dialog'
import { RoleGuard } from '@/components/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { config } from '@/lib/config'
import {
  deletePtSessions,
  fetchPtSessions,
  formatPtSessionStatusLabel,
  formatScheduleSummary,
  generatePtAssignmentSessions,
  getJamaicaDateValue,
  getMonthDateValues,
  getMonthLabel,
  getMonthValueInJamaica,
  getPtSessionStatusBadgeClassName,
  MAX_PT_SESSIONS_PER_WEEK,
  parseMonthValue,
  type GeneratePtSessionsResult,
  SESSION_STATUSES,
  type TrainerClient,
  type PtSession,
  type PtSessionFilterStatus,
  type SessionStatus,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { hasStaffTitle } from '@/lib/staff'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const scheduleCalendarStatusBadgeClassNames: Partial<Record<SessionStatus, string>> = {
  scheduled: 'bg-blue-500/15 text-blue-700 hover:bg-blue-500/25',
  cancelled: 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25',
  rescheduled: 'bg-orange-500/15 text-orange-700 hover:bg-orange-500/25',
}

type PendingGenerateOverride = {
  month: number
  year: number
  warnings: Array<{
    assignmentId: string
    warning: Extract<GeneratePtSessionsResult, { ok: false }>
  }>
  generatedAssignments: number
  skippedAssignments: number
}

type BulkGenerationSummary = {
  generatedAssignments: number
  skippedAssignments: number
  unconfirmedOverrideAssignments: number
}

const EMPTY_ACTIVE_ASSIGNMENTS: TrainerClient[] = []
const EMPTY_REMOVE_MONTH_SESSIONS: PtSession[] = []

type RemoveMonthAssignmentTarget = {
  assignmentId: string
  memberName?: string
  trainerName?: string
  sessions: PtSession[]
  statusCounts: Partial<Record<SessionStatus, number>>
}

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

function getScheduleCalendarStatusBadgeClassName(status: SessionStatus) {
  return scheduleCalendarStatusBadgeClassNames[status] ?? getPtSessionStatusBadgeClassName(status)
}

function formatGenerateAssignmentLabel(
  assignment: Pick<TrainerClient, 'memberName' | 'trainerName'>,
) {
  return `${assignment.memberName ?? 'Member'} <-> ${assignment.trainerName ?? 'Trainer'}`
}

function formatPtAssignmentLabel(
  target: Pick<TrainerClient, 'memberName' | 'trainerName'> | Pick<PtSession, 'memberName' | 'trainerName'>,
) {
  return `${target.memberName ?? 'Member'} <-> ${target.trainerName ?? 'Trainer'}`
}

function formatRemoveStatusSummary(statusCounts: Partial<Record<SessionStatus, number>>) {
  return SESSION_STATUSES.flatMap((status) => {
    const count = statusCounts[status] ?? 0

    if (count === 0) {
      return []
    }

    return `${formatPtSessionStatusLabel(status)} ${count}`
  }).join(' • ')
}

function getRemoveSessionsToastDescription(
  summary: {
    deletedAssignments: number
    deletedSessions: number
  },
  monthLabel: string,
) {
  if (summary.deletedSessions === 0) {
    return `No matching sessions remained to remove for ${monthLabel}.`
  }

  return `Removed ${summary.deletedSessions} session${
    summary.deletedSessions === 1 ? '' : 's'
  } across ${summary.deletedAssignments} assignment${
    summary.deletedAssignments === 1 ? '' : 's'
  } for ${monthLabel}.`
}

function getBulkGenerationToastTitle(summary: BulkGenerationSummary) {
  return summary.generatedAssignments > 0 ? 'Sessions generated' : 'No sessions generated'
}

function getBulkGenerationToastDescription(summary: BulkGenerationSummary) {
  if (summary.generatedAssignments === 0 && summary.skippedAssignments > 0 && summary.unconfirmedOverrideAssignments === 0) {
    return 'No sessions were generated. Sessions already exist for the selected month for all selected assignments.'
  }

  const parts: string[] = []

  if (summary.generatedAssignments > 0) {
    parts.push(
      `Sessions generated for ${summary.generatedAssignments} assignment${summary.generatedAssignments === 1 ? '' : 's'}.`,
    )
  } else {
    parts.push('No sessions were generated.')
  }

  if (summary.skippedAssignments > 0) {
    parts.push(`${summary.skippedAssignments} skipped — sessions already exist for the selected month.`)
  }

  if (summary.unconfirmedOverrideAssignments > 0) {
    parts.push(
      `${summary.unconfirmedOverrideAssignments} not generated — override was not confirmed.`,
    )
  }

  return parts.join(' ')
}

function getPendingOverrideDescription(pendingOverride: PendingGenerateOverride) {
  const weeks = Array.from(
    new Set(
      pendingOverride.warnings.flatMap((item) =>
        item.warning.code === 'WEEK_LIMIT_EXCEEDED' ? item.warning.weeks : [],
      ),
    ),
  ).sort()
  const assignmentLabel = `${pendingOverride.warnings.length} assignment${
    pendingOverride.warnings.length === 1 ? '' : 's'
  }`

  if (weeks.length > 0) {
    return `${assignmentLabel} would exceed ${MAX_PT_SESSIONS_PER_WEEK} sessions in some weeks (${weeks.join(', ')}). Override and generate anyway?`
  }

  return `${assignmentLabel} ${pendingOverride.warnings.length === 1 ? 'requires' : 'require'} an override to continue generation. Override and generate anyway?`
}

function SchedulePageContent() {
  const queryClient = useQueryClient()
  const calendarHeaderScrollRef = useRef<HTMLDivElement | null>(null)
  const calendarBodyScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollSyncSourceRef = useRef<'header' | 'body' | null>(null)
  const overrideResolutionInFlightRef = useRef(false)
  const showDevRemovePtSessionsButton = config.features.showDevRemovePtSessionsButton
  const [monthValue, setMonthValue] = useState(() => getMonthValueInJamaica())
  const [trainerFilter, setTrainerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | PtSessionFilterStatus>('active')
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [selectedGenerateAssignmentIds, setSelectedGenerateAssignmentIds] = useState<string[]>([])
  const [generateMonthValue, setGenerateMonthValue] = useState(() => getMonthValueInJamaica())
  const [pendingOverride, setPendingOverride] = useState<PendingGenerateOverride | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [showRemoveConfirmDialog, setShowRemoveConfirmDialog] = useState(false)
  const [selectedRemoveAssignmentIds, setSelectedRemoveAssignmentIds] = useState<string[]>([])
  const [removeMonthValue, setRemoveMonthValue] = useState(() => getMonthValueInJamaica())
  const [removeMonthSessions, setRemoveMonthSessions] = useState<PtSession[]>(EMPTY_REMOVE_MONTH_SESSIONS)
  const [removeMonthSessionsError, setRemoveMonthSessionsError] = useState<string | null>(null)
  const [isLoadingRemoveMonthSessions, setIsLoadingRemoveMonthSessions] = useState(false)
  const [isRemovingSessions, setIsRemovingSessions] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const monthParts = parseMonthValue(monthValue)
  const calendarMonthLabel = monthParts ? getMonthLabel(monthParts.month, monthParts.year) : monthValue
  const generateMonthParts = parseMonthValue(generateMonthValue)
  const removeMonthParts = parseMonthValue(removeMonthValue)
  const removeMonthLabel = removeMonthParts
    ? getMonthLabel(removeMonthParts.month, removeMonthParts.year)
    : removeMonthValue
  const calendarCells = useMemo(() => getCalendarCells(monthValue), [monthValue])
  const { sessions, isLoading, error } = usePtSessions({
    month: monthValue,
    trainerId: trainerFilter !== 'all' ? trainerFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })
  const { staff } = useStaff()
  const activeAssignmentsQuery = usePtAssignments({ status: 'active' })
  const activeAssignments = activeAssignmentsQuery.data ?? EMPTY_ACTIVE_ASSIGNMENTS
  const trainerOptions = useMemo(
    () => staff.filter((profile) => hasStaffTitle(profile.titles, 'Trainer')),
    [staff],
  )
  const selectedGenerateAssignmentIdSet = useMemo(
    () => new Set(selectedGenerateAssignmentIds),
    [selectedGenerateAssignmentIds],
  )
  const selectedGenerateAssignments = useMemo(
    () => activeAssignments.filter((assignment) => selectedGenerateAssignmentIdSet.has(assignment.id)),
    [activeAssignments, selectedGenerateAssignmentIdSet],
  )
  const selectedRemoveAssignmentIdSet = useMemo(
    () => new Set(selectedRemoveAssignmentIds),
    [selectedRemoveAssignmentIds],
  )
  const allGenerateAssignmentsSelected =
    activeAssignments.length > 0 &&
    selectedGenerateAssignments.length === activeAssignments.length
  const generateSelectAllState: boolean | 'indeterminate' =
    selectedGenerateAssignments.length === 0
      ? false
      : allGenerateAssignmentsSelected
        ? true
        : 'indeterminate'
  const canGenerateSelectedAssignments =
    Boolean(generateMonthParts) && selectedGenerateAssignments.length > 0 && !isGenerating
  const removeMonthAssignmentTargets = useMemo(() => {
    const groupedTargets = new Map<string, RemoveMonthAssignmentTarget>()

    for (const session of removeMonthSessions) {
      const existingTarget = groupedTargets.get(session.assignmentId)
      const statusCounts = existingTarget?.statusCounts ?? {}

      statusCounts[session.status] = (statusCounts[session.status] ?? 0) + 1

      groupedTargets.set(session.assignmentId, {
        assignmentId: session.assignmentId,
        memberName: existingTarget?.memberName ?? session.memberName,
        trainerName: existingTarget?.trainerName ?? session.trainerName,
        sessions: [...(existingTarget?.sessions ?? []), session],
        statusCounts,
      })
    }

    return Array.from(groupedTargets.values()).sort((left, right) =>
      formatPtAssignmentLabel(left).localeCompare(formatPtAssignmentLabel(right)),
    )
  }, [removeMonthSessions])
  const selectedRemoveAssignmentTargets = useMemo(
    () =>
      removeMonthAssignmentTargets.filter((target) =>
        selectedRemoveAssignmentIdSet.has(target.assignmentId),
      ),
    [removeMonthAssignmentTargets, selectedRemoveAssignmentIdSet],
  )
  const allRemoveAssignmentsSelected =
    removeMonthAssignmentTargets.length > 0 &&
    selectedRemoveAssignmentTargets.length === removeMonthAssignmentTargets.length
  const removeSelectAllState: boolean | 'indeterminate' =
    selectedRemoveAssignmentTargets.length === 0
      ? false
      : allRemoveAssignmentsSelected
        ? true
        : 'indeterminate'
  const selectedRemoveSessionIds = useMemo(
    () =>
      selectedRemoveAssignmentTargets.flatMap((target) =>
        target.sessions.map((session) => session.id),
      ),
    [selectedRemoveAssignmentTargets],
  )
  const canReviewRemoveAssignments =
    Boolean(removeMonthParts) &&
    selectedRemoveAssignmentTargets.length > 0 &&
    !isLoadingRemoveMonthSessions &&
    !isRemovingSessions
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

  useEffect(() => {
    const availableAssignmentIds = new Set(activeAssignments.map((assignment) => assignment.id))

    setSelectedGenerateAssignmentIds((current) =>
      current.filter((assignmentId) => availableAssignmentIds.has(assignmentId)),
    )
  }, [activeAssignments])

  useEffect(() => {
    const availableAssignmentIds = new Set(
      removeMonthAssignmentTargets.map((target) => target.assignmentId),
    )

    setSelectedRemoveAssignmentIds((current) =>
      current.filter((assignmentId) => availableAssignmentIds.has(assignmentId)),
    )
  }, [removeMonthAssignmentTargets])

  useEffect(() => {
    if (!showRemoveDialog) {
      return
    }

    if (!parseMonthValue(removeMonthValue)) {
      setRemoveMonthSessions([])
      setRemoveMonthSessionsError(null)
      setIsLoadingRemoveMonthSessions(false)
      return
    }

    let isCancelled = false

    setIsLoadingRemoveMonthSessions(true)
    setRemoveMonthSessionsError(null)

    void queryClient
      .fetchQuery({
        queryKey: queryKeys.ptScheduling.sessions({ month: removeMonthValue }),
        queryFn: () => fetchPtSessions({ month: removeMonthValue }),
      })
      .then((loadedSessions) => {
        if (isCancelled) {
          return
        }

        setRemoveMonthSessions(loadedSessions)
      })
      .catch((loadError) => {
        if (isCancelled) {
          return
        }

        setRemoveMonthSessions([])
        setRemoveMonthSessionsError(
          loadError instanceof Error ? loadError.message : 'Failed to load PT sessions.',
        )
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingRemoveMonthSessions(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [queryClient, removeMonthValue, showRemoveDialog])

  const syncCalendarScroll = (source: 'header' | 'body', scrollLeft: number) => {
    const target = source === 'header' ? calendarBodyScrollRef.current : calendarHeaderScrollRef.current

    if (!target || target.scrollLeft === scrollLeft) {
      return
    }

    scrollSyncSourceRef.current = source
    target.scrollLeft = scrollLeft

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (scrollSyncSourceRef.current === source) {
          scrollSyncSourceRef.current = null
        }
      })
    } else {
      scrollSyncSourceRef.current = null
    }
  }

  const handleCalendarScroll = (source: 'header' | 'body', scrollLeft: number) => {
    if (scrollSyncSourceRef.current && scrollSyncSourceRef.current !== source) {
      return
    }

    syncCalendarScroll(source, scrollLeft)
  }

  const resetGenerateSelection = () => {
    setSelectedGenerateAssignmentIds([])
  }

  const resetRemoveSelection = () => {
    setSelectedRemoveAssignmentIds([])
  }

  const handleGenerateDialogOpenChange = (open: boolean) => {
    if (!open && isGenerating) {
      return
    }

    setShowGenerateDialog(open)

    if (!open) {
      resetGenerateSelection()
    }
  }

  const handleRemoveDialogOpenChange = (open: boolean) => {
    if (!open && isRemovingSessions) {
      return
    }

    setShowRemoveDialog(open)

    if (!open) {
      setShowRemoveConfirmDialog(false)
      setRemoveMonthSessions([])
      setRemoveMonthSessionsError(null)
      resetRemoveSelection()
    }
  }

  const finalizeBulkGeneration = async (summary: BulkGenerationSummary) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.ptScheduling.sessions({}),
      exact: false,
    })
    setShowGenerateDialog(false)
    resetGenerateSelection()
    setPendingOverride(null)
    toast({
      title: getBulkGenerationToastTitle(summary),
      description: getBulkGenerationToastDescription(summary),
    })
  }

  const handleGenerateAssignmentToggle = (assignmentId: string) => {
    setSelectedGenerateAssignmentIds((current) =>
      current.includes(assignmentId)
        ? current.filter((currentAssignmentId) => currentAssignmentId !== assignmentId)
        : [...current, assignmentId],
    )
  }

  const handleSelectAllGenerateAssignments = (checked: boolean) => {
    setSelectedGenerateAssignmentIds(checked ? activeAssignments.map((assignment) => assignment.id) : [])
  }

  const handleRemoveAssignmentToggle = (assignmentId: string) => {
    setSelectedRemoveAssignmentIds((current) =>
      current.includes(assignmentId)
        ? current.filter((currentAssignmentId) => currentAssignmentId !== assignmentId)
        : [...current, assignmentId],
    )
  }

  const handleSelectAllRemoveAssignments = (checked: boolean) => {
    setSelectedRemoveAssignmentIds(
      checked ? removeMonthAssignmentTargets.map((target) => target.assignmentId) : [],
    )
  }

  const handleGenerate = async () => {
    if (selectedGenerateAssignments.length === 0 || !generateMonthParts) {
      toast({
        title: 'Selection required',
        description: 'Choose at least one active assignment and a month before generating sessions.',
        variant: 'destructive',
      })
      return
    }

    setIsGenerating(true)

    try {
      const monthSessions = await queryClient.fetchQuery({
        queryKey: queryKeys.ptScheduling.sessions({ month: generateMonthValue }),
        queryFn: () => fetchPtSessions({ month: generateMonthValue }),
      })
      const existingAssignmentIds = new Set(
        monthSessions.map((session) => session.assignmentId).filter((assignmentId) => Boolean(assignmentId)),
      )
      const warnings: PendingGenerateOverride['warnings'] = []
      let generatedAssignments = 0
      let skippedAssignments = 0

      for (const assignment of selectedGenerateAssignments) {
        if (existingAssignmentIds.has(assignment.id)) {
          skippedAssignments += 1
          continue
        }

        const result = await generatePtAssignmentSessions(assignment.id, {
          month: generateMonthParts.month,
          year: generateMonthParts.year,
        })

        if (!result.ok) {
          warnings.push({
            assignmentId: assignment.id,
            warning: result,
          })
          continue
        }

        if (result.generated > 0) {
          generatedAssignments += 1
        } else {
          skippedAssignments += 1
        }
      }

      if (warnings.length > 0) {
        setShowGenerateDialog(false)
        resetGenerateSelection()
        setPendingOverride({
          month: generateMonthParts.month,
          year: generateMonthParts.year,
          warnings,
          generatedAssignments,
          skippedAssignments,
        })
        return
      }

      await finalizeBulkGeneration({
        generatedAssignments,
        skippedAssignments,
        unconfirmedOverrideAssignments: 0,
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

  const resolvePendingOverride = async (action: 'confirm' | 'decline') => {
    if (!pendingOverride || overrideResolutionInFlightRef.current) {
      return
    }

    overrideResolutionInFlightRef.current = true
    const currentPendingOverride = pendingOverride
    setPendingOverride(null)
    setIsGenerating(true)

    try {
      if (action === 'decline') {
        await finalizeBulkGeneration({
          generatedAssignments: currentPendingOverride.generatedAssignments,
          skippedAssignments: currentPendingOverride.skippedAssignments,
          unconfirmedOverrideAssignments: currentPendingOverride.warnings.length,
        })
        return
      }

      let generatedAssignments = currentPendingOverride.generatedAssignments
      let skippedAssignments = currentPendingOverride.skippedAssignments

      for (const item of currentPendingOverride.warnings) {
        const result = await generatePtAssignmentSessions(item.assignmentId, {
          month: currentPendingOverride.month,
          year: currentPendingOverride.year,
          override: true,
        })

        if (!result.ok) {
          throw new Error('Failed to override PT session generation for one or more assignments.')
        }

        if (result.generated > 0) {
          generatedAssignments += 1
        } else {
          skippedAssignments += 1
        }
      }

      await finalizeBulkGeneration({
        generatedAssignments,
        skippedAssignments,
        unconfirmedOverrideAssignments: 0,
      })
    } catch (error) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ptScheduling.sessions({}),
        exact: false,
      })
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate PT sessions.',
        variant: 'destructive',
      })
    } finally {
      overrideResolutionInFlightRef.current = false
      setIsGenerating(false)
    }
  }

  const handleRemoveSessions = async () => {
    if (selectedRemoveAssignmentTargets.length === 0 || !removeMonthParts) {
      toast({
        title: 'Selection required',
        description: 'Choose at least one assignment and a month before removing sessions.',
        variant: 'destructive',
      })
      return
    }

    const sessionIdsToRemove = new Set(selectedRemoveSessionIds)

    setIsRemovingSessions(true)

    try {
      const result = await deletePtSessions({
        month: removeMonthValue,
        assignmentIds: selectedRemoveAssignmentTargets.map((target) => target.assignmentId),
      })

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.ptScheduling.sessions({}),
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.pendingApprovalCounts.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.rescheduleRequests.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionUpdateRequests.all,
        }),
      ])

      if (selectedSessionId && sessionIdsToRemove.has(selectedSessionId)) {
        setSelectedSessionId(null)
      }

      setShowRemoveConfirmDialog(false)
      setShowRemoveDialog(false)
      setRemoveMonthSessions([])
      setRemoveMonthSessionsError(null)
      resetRemoveSelection()
      toast({
        title: result.deletedSessions > 0 ? 'Sessions removed' : 'No sessions removed',
        description: getRemoveSessionsToastDescription(result, removeMonthLabel),
      })
    } catch (removeError) {
      toast({
        title: 'Removal failed',
        description: removeError instanceof Error ? removeError.message : 'Failed to remove PT sessions.',
        variant: 'destructive',
      })
    } finally {
      setIsRemovingSessions(false)
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
                {calendarMonthLabel}
              </div>
              <Button variant="outline" onClick={() => setMonthValue((current) => shiftMonthValue(current, 1))}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {showDevRemovePtSessionsButton ? (
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setRemoveMonthValue(monthValue)
                    setShowRemoveConfirmDialog(false)
                    setShowRemoveDialog(true)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  DEV: Remove Sessions
                </Button>
              ) : null}

              <Button onClick={() => setShowGenerateDialog(true)}>
                <WandSparkles className="h-4 w-4" />
                Generate Sessions
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-trainer-filter">Trainer</Label>
            <Select value={trainerFilter} onValueChange={setTrainerFilter}>
              <SelectTrigger id="schedule-trainer-filter" className="w-[200px]">
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
              <SelectTrigger id="schedule-status-filter" className="w-[200px]">
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
        </div>

        <Card>
          <CardContent className="p-0">
            <div
              data-testid="schedule-calendar-sticky-header"
              className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
              <div
                data-testid="schedule-calendar-header-scroll"
                ref={calendarHeaderScrollRef}
                onScroll={(event) => handleCalendarScroll('header', event.currentTarget.scrollLeft)}
                className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div data-testid="schedule-calendar-surface" className="min-w-[70rem]">
                  <div
                    data-testid="schedule-calendar-month-header"
                    className="flex h-12 items-center justify-center border-b px-4 text-sm font-semibold tracking-[0.24em] uppercase"
                  >
                    {calendarMonthLabel}
                  </div>

                  <div
                    data-testid="schedule-calendar-weekday-header"
                    className="grid grid-cols-7"
                  >
                    {WEEKDAY_LABELS.map((weekday) => (
                      <div
                        key={weekday}
                        className="bg-muted/50 border-r p-3 text-center text-sm font-medium last:border-r-0"
                      >
                        {weekday}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              data-testid="schedule-calendar-scroll"
              ref={calendarBodyScrollRef}
              onScroll={(event) => handleCalendarScroll('body', event.currentTarget.scrollLeft)}
              className="overflow-x-auto"
            >
              <div className="min-w-[70rem]">
                {isLoading ? (
                  <div className="grid grid-cols-7">
                    <div className="col-span-7 p-6">
                      <Skeleton className="h-[480px] w-full" />
                    </div>
                  </div>
                ) : error ? (
                  <div className="grid grid-cols-7">
                    <div className="col-span-7 p-6">
                      <p className="text-destructive text-sm">
                        {error instanceof Error ? error.message : 'Failed to load PT sessions.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="schedule-calendar-grid"
                    className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0"
                  >
                    {calendarCells.map((cell) => {
                      const daySessions = sessionsByDate.get(cell.dateValue) ?? []

                      return (
                        <div
                          key={cell.dateValue}
                          className="min-h-[180px] border-b border-r p-3"
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
                                  className={getScheduleCalendarStatusBadgeClassName(session.status)}
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
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showGenerateDialog} onOpenChange={handleGenerateDialogOpenChange}>
        <DialogContent className="sm:max-w-[560px]" isLoading={isGenerating}>
          <DialogHeader>
            <DialogTitle>Generate Sessions</DialogTitle>
            <DialogDescription>
              Create recurring PT sessions for one or more active assignments in the selected month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-base">Assignments</Label>
                  <p className="text-muted-foreground text-sm">
                    {selectedGenerateAssignments.length} of {activeAssignments.length} selected
                  </p>
                </div>

                <div
                  className={`flex items-center gap-2 ${
                    activeAssignments.length === 0 || isGenerating ? '' : 'cursor-pointer'
                  }`}
                  role="button"
                  tabIndex={activeAssignments.length === 0 || isGenerating ? -1 : 0}
                  onClick={() => {
                    if (activeAssignments.length === 0 || isGenerating) {
                      return
                    }

                    handleSelectAllGenerateAssignments(!allGenerateAssignmentsSelected)
                  }}
                  onKeyDown={(event) => {
                    if (
                      activeAssignments.length === 0 ||
                      isGenerating ||
                      (event.key !== 'Enter' && event.key !== ' ')
                    ) {
                      return
                    }

                    event.preventDefault()
                    handleSelectAllGenerateAssignments(!allGenerateAssignmentsSelected)
                  }}
                >
                  <Checkbox
                    id="generate-select-all"
                    checked={generateSelectAllState}
                    onCheckedChange={(checked) =>
                      handleSelectAllGenerateAssignments(checked === true)
                    }
                    disabled={activeAssignments.length === 0 || isGenerating}
                    aria-label="Select all assignments"
                    onClick={(event) => event.stopPropagation()}
                  />
                  <Label htmlFor="generate-select-all" className="cursor-pointer">
                    Select all
                  </Label>
                </div>
              </div>

              {activeAssignmentsQuery.isLoading ? (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              ) : activeAssignments.length > 0 ? (
                <div className="max-h-[320px] overflow-y-auto rounded-lg border">
                  {activeAssignments.map((assignment) => {
                    const isSelected = selectedGenerateAssignmentIdSet.has(assignment.id)

                    return (
                      <div
                        key={assignment.id}
                        data-testid={`generate-assignment-row-${assignment.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleGenerateAssignmentToggle(assignment.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleGenerateAssignmentToggle(assignment.id)
                          }
                        }}
                        className={`flex items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 ${
                          isSelected ? 'bg-muted/40' : 'hover:bg-muted/20'
                        } ${isGenerating ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleGenerateAssignmentToggle(assignment.id)}
                          disabled={isGenerating}
                          aria-label={`Select ${formatGenerateAssignmentLabel(assignment)}`}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {formatGenerateAssignmentLabel(assignment)}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {formatScheduleSummary(
                              assignment.scheduledSessions,
                              assignment.sessionsPerWeek,
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
                  No active assignments found.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleGenerateDialogOpenChange(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerateSelectedAssignments}
              loading={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRemoveDialog} onOpenChange={handleRemoveDialogOpenChange}>
        <DialogContent className="sm:max-w-[640px]" isLoading={isRemovingSessions}>
          <DialogHeader>
            <DialogTitle>DEV: Remove Sessions</DialogTitle>
            <DialogDescription>
              Permanently remove PT sessions for selected assignments in the chosen month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="remove-month">Month</Label>
              <Input
                id="remove-month"
                type="month"
                value={removeMonthValue}
                onChange={(event) => {
                  setRemoveMonthValue(event.target.value)
                  setShowRemoveConfirmDialog(false)
                  resetRemoveSelection()
                }}
                disabled={isRemovingSessions}
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label className="text-base">Assignments</Label>
                  <p className="text-muted-foreground text-sm">
                    {selectedRemoveAssignmentTargets.length} of {removeMonthAssignmentTargets.length} selected
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 ${
                      removeMonthAssignmentTargets.length === 0 ||
                      isLoadingRemoveMonthSessions ||
                      isRemovingSessions
                        ? ''
                        : 'cursor-pointer'
                    }`}
                    role="button"
                    tabIndex={
                      removeMonthAssignmentTargets.length === 0 ||
                      isLoadingRemoveMonthSessions ||
                      isRemovingSessions
                        ? -1
                        : 0
                    }
                    onClick={() => {
                      if (
                        removeMonthAssignmentTargets.length === 0 ||
                        isLoadingRemoveMonthSessions ||
                        isRemovingSessions
                      ) {
                        return
                      }

                      handleSelectAllRemoveAssignments(!allRemoveAssignmentsSelected)
                    }}
                    onKeyDown={(event) => {
                      if (
                        removeMonthAssignmentTargets.length === 0 ||
                        isLoadingRemoveMonthSessions ||
                        isRemovingSessions ||
                        (event.key !== 'Enter' && event.key !== ' ')
                      ) {
                        return
                      }

                      event.preventDefault()
                      handleSelectAllRemoveAssignments(!allRemoveAssignmentsSelected)
                    }}
                  >
                    <Checkbox
                      id="remove-select-all"
                      checked={removeSelectAllState}
                      onCheckedChange={(checked) =>
                        handleSelectAllRemoveAssignments(checked === true)
                      }
                      disabled={
                        removeMonthAssignmentTargets.length === 0 ||
                        isLoadingRemoveMonthSessions ||
                        isRemovingSessions
                      }
                      aria-label="Select all removable assignments"
                      onClick={(event) => event.stopPropagation()}
                    />
                    <Label htmlFor="remove-select-all" className="cursor-pointer">
                      Select all
                    </Label>
                  </div>

                  {selectedRemoveAssignmentTargets.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resetRemoveSelection()}
                      disabled={isLoadingRemoveMonthSessions || isRemovingSessions}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>

              {isLoadingRemoveMonthSessions ? (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              ) : removeMonthSessionsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6">
                  <p className="text-destructive text-sm">{removeMonthSessionsError}</p>
                </div>
              ) : removeMonthAssignmentTargets.length > 0 ? (
                <div className="max-h-[320px] overflow-y-auto rounded-lg border">
                  {removeMonthAssignmentTargets.map((target) => {
                    const isSelected = selectedRemoveAssignmentIdSet.has(target.assignmentId)

                    return (
                      <div
                        key={target.assignmentId}
                        data-testid={`remove-assignment-row-${target.assignmentId}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleRemoveAssignmentToggle(target.assignmentId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleRemoveAssignmentToggle(target.assignmentId)
                          }
                        }}
                        className={`flex items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 ${
                          isSelected ? 'bg-muted/40' : 'hover:bg-muted/20'
                        } ${
                          isLoadingRemoveMonthSessions || isRemovingSessions
                            ? 'pointer-events-none opacity-70'
                            : 'cursor-pointer'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleRemoveAssignmentToggle(target.assignmentId)}
                          disabled={isLoadingRemoveMonthSessions || isRemovingSessions}
                          aria-label={`Remove ${formatPtAssignmentLabel(target)}`}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {formatPtAssignmentLabel(target)}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {target.sessions.length} session{target.sessions.length === 1 ? '' : 's'} •{' '}
                            {formatRemoveStatusSummary(target.statusCounts)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
                  No PT sessions found for {removeMonthLabel}.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleRemoveDialogOpenChange(false)}
              disabled={isRemovingSessions}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowRemoveConfirmDialog(true)}
              disabled={!canReviewRemoveAssignments}
            >
              Review Removal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showRemoveConfirmDialog}
        onOpenChange={(open) => {
          if (!open && !isRemovingSessions) {
            setShowRemoveConfirmDialog(false)
          }
        }}
        title="Delete selected sessions?"
        description={`This will permanently delete ${selectedRemoveSessionIds.length} session${
          selectedRemoveSessionIds.length === 1 ? '' : 's'
        } across ${selectedRemoveAssignmentTargets.length} assignment${
          selectedRemoveAssignmentTargets.length === 1 ? '' : 's'
        } for ${removeMonthLabel}.`}
        confirmLabel="Delete sessions"
        cancelLabel="Keep sessions"
        onConfirm={() => void handleRemoveSessions()}
        onCancel={() => setShowRemoveConfirmDialog(false)}
        isLoading={isRemovingSessions}
        variant="destructive"
      />

      <ConfirmDialog
        open={Boolean(pendingOverride)}
        onOpenChange={(open) => {
          if (!open && pendingOverride && !isGenerating) {
            void resolvePendingOverride('decline')
          }
        }}
        title="Override generation warnings?"
        description={
          pendingOverride
            ? getPendingOverrideDescription(pendingOverride)
            : 'Some selected assignments require an override to continue generation.'
        }
        confirmLabel="Generate remaining"
        cancelLabel="Cancel"
        onConfirm={() => void resolvePendingOverride('confirm')}
        onCancel={() => void resolvePendingOverride('decline')}
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
