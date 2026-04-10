'use client'

import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ClassAttendanceDialog } from '@/components/class-attendance-dialog'
import { ClassRegistrationDialog } from '@/components/class-registration-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SearchableSelect } from '@/components/searchable-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/auth-context'
import { useBackLink } from '@/hooks/use-back-link'
import {
  useClassDetail,
  useClassRegistrations,
  useClassScheduleRules,
  useClassSessions,
  useClassTrainers,
} from '@/hooks/use-classes'
import { usePermissions } from '@/hooks/use-permissions'
import { useStaff } from '@/hooks/use-staff'
import { toast } from '@/hooks/use-toast'
import {
  assignClassTrainer,
  calculateClassRegistrationAmount,
  createClassScheduleRule,
  type ClassTrainerProfile,
  deleteClassScheduleRule,
  formatClassDate,
  formatClassDateTime,
  formatClassSessionDate,
  formatClassSessionTime,
  formatClassTime,
  formatOptionalJmd,
  generateClassSessions,
  getClassDayOfWeekLabel,
  getClassSessionPreviewItems,
  getDefaultClassDateValue,
  removeClassTrainer,
  reviewClassRegistration,
  sortClassScheduleRules,
  updateClassPeriodStart,
  type ClassRegistrationListItem,
  type ClassScheduleRuleDay,
  type ClassSessionListItem,
  type ClassSessionPreviewItem,
} from '@/lib/classes'
import { parseDateInputValue } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import { hasStaffTitle } from '@/lib/staff'
import { useProgressRouter } from '@/hooks/use-progress-router'

type ClassesTab = 'registrations' | 'pending' | 'sessions'

const DEFAULT_SCHEDULE_RULE_DAY: ClassScheduleRuleDay = 1
const DEFAULT_SCHEDULE_RULE_TIME = '09:00'

function InfoField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function EmptyCardState({
  label,
}: {
  label: string
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  )
}

function RegistrationsTable({
  registrations,
  showStatus = false,
  showActions = false,
  onApprove,
  onDeny,
}: {
  registrations: ClassRegistrationListItem[]
  showStatus?: boolean
  showActions?: boolean
  onApprove?: (registration: ClassRegistrationListItem) => void
  onDeny?: (registration: ClassRegistrationListItem) => void
}) {
  if (registrations.length === 0) {
    return (
      <EmptyCardState
        label={showActions ? 'No pending approvals.' : 'No approved registrations yet.'}
      />
    )
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <CardContent className="p-0">
        <Table size="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount Paid</TableHead>
              <TableHead>Period Start</TableHead>
              <TableHead>Registered At</TableHead>
              {showStatus ? <TableHead>Status</TableHead> : null}
              {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrations.map((registration) => (
              <TableRow key={registration.id}>
                <TableCell className="font-medium">{registration.registrant_name}</TableCell>
                <TableCell>
                  {registration.registrant_type === 'member' ? 'Member' : 'Guest'}
                </TableCell>
                <TableCell>{formatOptionalJmd(registration.amount_paid)}</TableCell>
                <TableCell>{formatClassDate(registration.month_start)}</TableCell>
                <TableCell>{formatClassDateTime(registration.created_at)}</TableCell>
                {showStatus ? (
                  <TableCell className="capitalize">{registration.status}</TableCell>
                ) : null}
                {showActions ? (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onDeny?.(registration)}
                      >
                        Deny
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onApprove?.(registration)}
                      >
                        Approve
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SessionsTable({
  sessions,
  actionLabel,
  onOpenAttendance,
}: {
  sessions: ClassSessionListItem[]
  actionLabel: string
  onOpenAttendance: (session: ClassSessionListItem) => void
}) {
  if (sessions.length === 0) {
    return <EmptyCardState label="No sessions generated for this period." />
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <CardContent className="p-0">
        <Table size="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Attendance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {formatClassSessionDate(session.scheduled_at)}
                </TableCell>
                <TableCell>{formatClassSessionTime(session.scheduled_at)}</TableCell>
                <TableCell>
                  {session.marked_count} / {session.total_count}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenAttendance(session)}
                    >
                      {actionLabel}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default function ClassDetailPage() {
  const params = useParams()
  const router = useProgressRouter()
  const queryClient = useQueryClient()
  const { profile, loading } = useAuth()
  const { can } = usePermissions()
  const classId = params.id as string
  const canManageSchedule = can('classes.manageSchedule')
  const isTrainerTitle = hasStaffTitle(profile?.titles, 'Trainer')
  const canManageAttendance = can('classes.markAttendance')
  const attendanceActionLabel = isTrainerTitle ? 'View Attendance' : 'Mark Attendance'
  const backLink = useBackLink('/classes', '/classes')
  const { classItem, isLoading, error } = useClassDetail(classId, {
    enabled: !loading,
  })
  const approvedRegistrationsQuery = useClassRegistrations(classId, 'approved', {
    enabled: !loading,
  })
  const scheduleRulesQuery = useClassScheduleRules(classId, {
    enabled: !loading && canManageSchedule,
  })
  const [activeTab, setActiveTab] = useState<ClassesTab>('registrations')
  const pendingRegistrationsQuery = useClassRegistrations(classId, 'pending', {
    enabled: !loading && canManageSchedule && activeTab === 'pending',
  })
  const sessionsQuery = useClassSessions(classId, classItem?.current_period_start ?? null, {
    enabled: !loading && Boolean(classItem?.current_period_start),
  })
  const trainersQuery = useClassTrainers(classId, {
    enabled: !loading && canManageSchedule,
  })
  const staffQuery = useStaff({
    enabled: !loading && canManageSchedule,
  })
  const [showRegistrationDialog, setShowRegistrationDialog] = useState(false)
  const [showPeriodDialog, setShowPeriodDialog] = useState(false)
  const [showAddRuleDialog, setShowAddRuleDialog] = useState(false)
  const [showAddTrainerDialog, setShowAddTrainerDialog] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [periodStart, setPeriodStart] = useState(getDefaultClassDateValue)
  const [scheduleRuleDay, setScheduleRuleDay] = useState<ClassScheduleRuleDay>(
    DEFAULT_SCHEDULE_RULE_DAY,
  )
  const [scheduleRuleTime, setScheduleRuleTime] = useState(DEFAULT_SCHEDULE_RULE_TIME)
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [isPeriodPickerOpen, setIsPeriodPickerOpen] = useState(false)
  const [approveRegistrationItem, setApproveRegistrationItem] =
    useState<ClassRegistrationListItem | null>(null)
  const [approveAmount, setApproveAmount] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [denyRegistrationItem, setDenyRegistrationItem] =
    useState<ClassRegistrationListItem | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [pendingAction, setPendingAction] = useState<
    null | 'period' | 'approve' | 'deny' | 'schedule-rule' | 'generate'
  >(null)
  const [trainerAction, setTrainerAction] = useState<null | 'add'>(null)
  const [pendingTrainerRemovalIds, setPendingTrainerRemovalIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pendingScheduleRuleIds, setPendingScheduleRuleIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [previewItems, setPreviewItems] = useState<ClassSessionPreviewItem[]>([])
  const [selectedSession, setSelectedSession] = useState<ClassSessionListItem | null>(null)
  const [trainerToRemove, setTrainerToRemove] = useState<ClassTrainerProfile | null>(null)

  useEffect(() => {
    if (!classItem?.current_period_start) {
      setPeriodStart(getDefaultClassDateValue())
      return
    }

    setPeriodStart(classItem.current_period_start)
  }, [classItem?.current_period_start])

  useEffect(() => {
    if (canManageSchedule || activeTab !== 'pending') {
      return
    }

    setActiveTab('registrations')
  }, [activeTab, canManageSchedule])

  useEffect(() => {
    if (showAddRuleDialog) {
      return
    }

    setScheduleRuleDay(DEFAULT_SCHEDULE_RULE_DAY)
    setScheduleRuleTime(DEFAULT_SCHEDULE_RULE_TIME)
  }, [showAddRuleDialog])

  useEffect(() => {
    if (showAddTrainerDialog) {
      return
    }

    setSelectedTrainerId('')
  }, [showAddTrainerDialog])

  const sortedScheduleRules = useMemo(
    () => sortClassScheduleRules(scheduleRulesQuery.scheduleRules),
    [scheduleRulesQuery.scheduleRules],
  )
  const assignedTrainerIds = useMemo(
    () => new Set(trainersQuery.trainers.map((trainer) => trainer.id)),
    [trainersQuery.trainers],
  )
  const availableTrainers = useMemo(
    () =>
      [...staffQuery.staff]
        .filter(
          (profile) =>
            hasStaffTitle(profile.titles, 'Trainer') && !assignedTrainerIds.has(profile.id),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assignedTrainerIds, staffQuery.staff],
  )
  const selectedTrainer = useMemo(
    () => availableTrainers.find((trainer) => trainer.id === selectedTrainerId) ?? null,
    [availableTrainers, selectedTrainerId],
  )

  useEffect(() => {
    if (!selectedTrainerId) {
      return
    }

    if (availableTrainers.some((trainer) => trainer.id === selectedTrainerId)) {
      return
    }

    setSelectedTrainerId('')
  }, [availableTrainers, selectedTrainerId])
  const generatedPreviewItems = useMemo(
    () =>
      classItem?.current_period_start
        ? getClassSessionPreviewItems(classItem.current_period_start, sortedScheduleRules)
        : [],
    [classItem?.current_period_start, sortedScheduleRules],
  )

  useEffect(() => {
    if (showGenerateDialog) {
      setPreviewItems(generatedPreviewItems)
    }
  }, [generatedPreviewItems, showGenerateDialog])

  const selectedPeriodStartDate = useMemo(
    () => parseDateInputValue(periodStart),
    [periodStart],
  )
  const displayedPeriodStart = selectedPeriodStartDate
    ? format(selectedPeriodStartDate, 'MMM d, yyyy')
    : 'Select a date'
  const isSavingPeriod = pendingAction === 'period'
  const isApproving = pendingAction === 'approve'
  const isDenying = pendingAction === 'deny'
  const isSavingScheduleRule = pendingAction === 'schedule-rule'
  const isGeneratingSessions = pendingAction === 'generate'
  const isSavingTrainer = trainerAction === 'add'
  const sessionsErrorLabel = sessionsQuery.error
    ? sessionsQuery.error instanceof Error
      ? sessionsQuery.error.message
      : 'Failed to load class sessions.'
    : null

  const invalidateClassQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.detail(classId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.all,
        exact: false,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.registrations(classId, ''),
        exact: false,
      }),
      queryClient.invalidateQueries({
        queryKey: ['classes', 'sessions', classId],
        exact: false,
      }),
    ])
  }

  const invalidateTrainerQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.trainers(classId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.detail(classId),
      }),
    ])
  }

  const updatePendingTrainerRemovalState = (trainerId: string, isPending: boolean) => {
    setPendingTrainerRemovalIds((current) => {
      const next = new Set(current)

      if (isPending) {
        next.add(trainerId)
      } else {
        next.delete(trainerId)
      }

      return next
    })
  }

  const updatePendingScheduleRuleState = (ruleId: string, isPending: boolean) => {
    setPendingScheduleRuleIds((current) => {
      const next = new Set(current)

      if (isPending) {
        next.add(ruleId)
      } else {
        next.delete(ruleId)
      }

      return next
    })
  }

  const openApproveDialog = (registration: ClassRegistrationListItem) => {
    if (!classItem) {
      return
    }

    const suggestedAmount =
      registration.amount_paid > 0
        ? registration.amount_paid
        : calculateClassRegistrationAmount({
            classItem,
            month_start: registration.month_start,
            registrant_type: registration.registrant_type,
          })

    setApproveRegistrationItem(registration)
    setApproveAmount(String(suggestedAmount))
    setApproveNote(registration.review_note ?? '')
  }

  const handleApprove = async () => {
    if (!approveRegistrationItem) {
      return
    }

    const parsedAmount = Number(approveAmount)

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast({
        title: 'Amount required',
        description: 'Enter a valid JMD amount before approving.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('approve')

    try {
      await reviewClassRegistration(classId, approveRegistrationItem.id, {
        status: 'approved',
        amount_paid: parsedAmount,
        review_note: approveNote.trim() || null,
      })
      await invalidateClassQueries()
      setApproveRegistrationItem(null)
      setApproveAmount('')
      setApproveNote('')
      toast({
        title: 'Registration approved',
      })
    } catch (approveError) {
      toast({
        title: 'Approval failed',
        description:
          approveError instanceof Error
            ? approveError.message
            : 'Failed to approve the class registration.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleDeny = async () => {
    if (!denyRegistrationItem) {
      return
    }

    if (!denyReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Enter a denial reason before submitting.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('deny')

    try {
      await reviewClassRegistration(classId, denyRegistrationItem.id, {
        status: 'denied',
        review_note: denyReason.trim(),
      })
      await invalidateClassQueries()
      setDenyRegistrationItem(null)
      setDenyReason('')
      toast({
        title: 'Registration denied',
      })
    } catch (denyError) {
      toast({
        title: 'Denial failed',
        description:
          denyError instanceof Error
            ? denyError.message
            : 'Failed to deny the class registration.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleUpdatePeriodStart = async () => {
    if (!periodStart) {
      return
    }

    setPendingAction('period')

    try {
      await updateClassPeriodStart(classId, periodStart)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.classes.detail(classId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.classes.all,
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ['classes', 'sessions', classId],
          exact: false,
        }),
      ])
      setShowPeriodDialog(false)
      toast({
        title: 'Billing period updated',
        description: `${classItem?.name ?? 'The class'} now starts on ${formatClassDate(periodStart)}.`,
      })
    } catch (periodError) {
      toast({
        title: 'Update failed',
        description:
          periodError instanceof Error
            ? periodError.message
            : 'Failed to update the billing period.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleAddScheduleRule = async () => {
    setPendingAction('schedule-rule')

    try {
      await createClassScheduleRule(classId, {
        day_of_week: scheduleRuleDay,
        session_time: scheduleRuleTime,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.classes.scheduleRules(classId),
        exact: false,
      })
      setShowAddRuleDialog(false)
      toast({
        title: 'Schedule rule added',
      })
    } catch (scheduleRuleError) {
      toast({
        title: 'Save failed',
        description:
          scheduleRuleError instanceof Error
            ? scheduleRuleError.message
            : 'Failed to save the schedule rule.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleDeleteScheduleRule = async (ruleId: string) => {
    updatePendingScheduleRuleState(ruleId, true)

    try {
      await deleteClassScheduleRule(classId, ruleId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.classes.scheduleRules(classId),
        exact: false,
      })
      toast({
        title: 'Schedule rule deleted',
      })
    } catch (deleteError) {
      toast({
        title: 'Delete failed',
        description:
          deleteError instanceof Error
            ? deleteError.message
            : 'Failed to delete the schedule rule.',
        variant: 'destructive',
      })
    } finally {
      updatePendingScheduleRuleState(ruleId, false)
    }
  }

  const handleAddTrainer = async () => {
    if (!classItem || !selectedTrainer) {
      toast({
        title: 'Trainer required',
        description: !classItem ? 'Reload the class before assigning a trainer.' : 'Select a trainer before saving.',
        variant: 'destructive',
      })
      return
    }

    setTrainerAction('add')

    try {
      await assignClassTrainer(classId, {
        profile_id: selectedTrainer.id,
      })
      await invalidateTrainerQueries()
      setShowAddTrainerDialog(false)
      toast({
        title: 'Trainer assigned',
        description: `${selectedTrainer.name} was assigned to ${classItem.name}.`,
      })
    } catch (trainerError) {
      toast({
        title: 'Unable to assign trainer',
        description:
          trainerError instanceof Error
            ? trainerError.message
            : 'Failed to assign the trainer to this class.',
        variant: 'destructive',
      })
    } finally {
      setTrainerAction(null)
    }
  }

  const handleRemoveTrainer = async () => {
    if (!classItem || !trainerToRemove) {
      return
    }

    const trainer = trainerToRemove
    updatePendingTrainerRemovalState(trainer.id, true)
    setTrainerToRemove(null)

    try {
      await removeClassTrainer(classId, trainer.id)
      await invalidateTrainerQueries()
      toast({
        title: 'Trainer removed',
        description: `${trainer.name} was removed from ${classItem.name}.`,
      })
    } catch (trainerError) {
      toast({
        title: 'Unable to remove trainer',
        description:
          trainerError instanceof Error
            ? trainerError.message
            : 'Failed to remove the trainer from this class.',
        variant: 'destructive',
      })
    } finally {
      updatePendingTrainerRemovalState(trainer.id, false)
    }
  }

  const handleGenerateSessions = async () => {
    if (!classItem?.current_period_start) {
      toast({
        title: 'Period start required',
        description: 'Set a period start date before generating sessions.',
        variant: 'destructive',
      })
      return
    }

    if (sortedScheduleRules.length === 0) {
      toast({
        title: 'Schedule rules required',
        description: 'Add schedule rules before generating sessions.',
        variant: 'destructive',
      })
      return
    }

    if (previewItems.length === 0) {
      toast({
        title: 'No sessions selected',
        description: 'Keep at least one preview date before confirming.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('generate')

    try {
      const createdCount = await generateClassSessions(classId, {
        sessions: previewItems.map((previewItem) => ({
          scheduled_at: previewItem.scheduled_at,
        })),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.classes.sessions(classId, classItem.current_period_start),
        exact: false,
      })
      setShowGenerateDialog(false)
      toast({
        title: 'Sessions generated',
        description:
          createdCount > 0
            ? `${createdCount} new session${createdCount === 1 ? '' : 's'} created for the current period.`
            : 'No new sessions were created for the current period.',
      })
    } catch (generateError) {
      toast({
        title: 'Generation failed',
        description:
          generateError instanceof Error
            ? generateError.message
            : 'Failed to generate class sessions.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  if (loading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">
          {error instanceof Error ? error.message : 'Failed to load the class.'}
        </p>
        <Button type="button" variant="outline" onClick={() => router.push(backLink)}>
          <ArrowLeft className="h-4 w-4" />
          Back to Classes
        </Button>
      </div>
    )
  }

  if (!classItem) {
    return null
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.push(backLink)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight">{classItem.name}</h1>
            <p className="text-sm text-muted-foreground">
              Review current registrations, schedules, sessions, and billing period settings.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Class Information</CardTitle>
              <CardDescription>{classItem.schedule_description}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageSchedule ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setShowPeriodDialog(true)}>
                    Set Period Start
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowGenerateDialog(true)}
                  >
                    Generate Sessions
                  </Button>
                </>
              ) : null}
              <Button type="button" onClick={() => setShowRegistrationDialog(true)}>
                Register
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <InfoField label="Monthly fee" value={formatOptionalJmd(classItem.monthly_fee)} />
            <InfoField label="Per session fee" value={formatOptionalJmd(classItem.per_session_fee)} />
            <InfoField
              label="Trainer compensation"
              value={`${classItem.trainer_compensation_pct}%`}
            />
            <InfoField
              label="Trainers"
              value={
                classItem.trainers.length > 0
                  ? classItem.trainers.map((trainer) => trainer.name).join(', ')
                  : 'No trainers assigned'
              }
            />
            <InfoField
              label="Current period start"
              value={formatClassDate(classItem.current_period_start)}
            />
          </CardContent>
        </Card>

        {canManageSchedule ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader className="gap-4">
                <div>
                  <CardTitle>Trainers</CardTitle>
                  <CardDescription>
                    Assign or remove trainer-title staff for this class.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setShowAddTrainerDialog(true)}
                  disabled={trainersQuery.isLoading || staffQuery.isLoading}
                >
                  <Plus className="h-4 w-4" />
                  Add Trainer
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {trainersQuery.isLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : trainersQuery.error ? (
                  <p className="text-sm text-destructive">
                    {trainersQuery.error instanceof Error
                      ? trainersQuery.error.message
                      : 'Failed to load class trainers.'}
                  </p>
                ) : trainersQuery.trainers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No trainers assigned to this class
                  </p>
                ) : (
                  trainersQuery.trainers.map((trainer) => {
                    const isRemovingTrainer = pendingTrainerRemovalIds.has(trainer.id)

                    return (
                      <div
                        key={trainer.id}
                        className="flex items-start justify-between gap-4 rounded-lg border p-3"
                      >
                        <div className="space-y-2">
                          <p className="font-medium">{trainer.name}</p>
                          <div className="flex flex-wrap gap-2">
                            {trainer.titles.length > 0 ? (
                              trainer.titles.map((title) => (
                                <Badge key={title} variant="outline">
                                  {title}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant="outline">No title assigned</Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Remove trainer ${trainer.name}`}
                          onClick={() => setTrainerToRemove(trainer)}
                          disabled={isRemovingTrainer}
                          loading={isRemovingTrainer}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="gap-4">
                <div>
                  <CardTitle>Schedule</CardTitle>
                  <CardDescription>
                    Manage recurring class rules.
                  </CardDescription>
                </div>
                <Button type="button" className="w-full" onClick={() => setShowAddRuleDialog(true)}>
                  <Plus className="h-4 w-4" />
                  Add Rule
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduleRulesQuery.isLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : scheduleRulesQuery.error ? (
                  <p className="text-sm text-destructive">
                    {scheduleRulesQuery.error instanceof Error
                      ? scheduleRulesQuery.error.message
                      : 'Failed to load schedule rules.'}
                  </p>
                ) : sortedScheduleRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No schedule rules added for this class yet.
                  </p>
                ) : (
                  sortedScheduleRules.map((rule) => {
                    const isDeletingRule = pendingScheduleRuleIds.has(rule.id)

                    return (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between gap-4 rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">{getClassDayOfWeekLabel(rule.day_of_week)}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatClassTime(rule.session_time)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Remove ${getClassDayOfWeekLabel(rule.day_of_week)} schedule rule`}
                          disabled={isDeletingRule}
                          loading={isDeletingRule}
                          onClick={() => void handleDeleteScheduleRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {canManageSchedule ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ClassesTab)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="registrations">Registrations</TabsTrigger>
              <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="registrations">
              {approvedRegistrationsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : approvedRegistrationsQuery.error ? (
                <EmptyCardState label="Failed to load approved registrations." />
              ) : (
                <RegistrationsTable registrations={approvedRegistrationsQuery.registrations} />
              )}
            </TabsContent>

            <TabsContent value="pending">
              {pendingRegistrationsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : pendingRegistrationsQuery.error ? (
                <EmptyCardState label="Failed to load pending approvals." />
              ) : (
                <RegistrationsTable
                  registrations={pendingRegistrationsQuery.registrations}
                  showStatus
                  showActions
                  onApprove={openApproveDialog}
                  onDeny={(registration) => {
                    setDenyRegistrationItem(registration)
                    setDenyReason('')
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="sessions" className="space-y-4">
              {!classItem.current_period_start ? (
                <Alert variant="warning">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Period Start Required</AlertTitle>
                  <AlertDescription>
                    Set a period start date before viewing sessions for the current period.
                  </AlertDescription>
                </Alert>
              ) : sessionsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : sessionsErrorLabel ? (
                <EmptyCardState label={sessionsErrorLabel} />
              ) : (
                <SessionsTable
                  sessions={sessionsQuery.sessions}
                  actionLabel={attendanceActionLabel}
                  onOpenAttendance={setSelectedSession}
                />
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <Tabs
            value={activeTab === 'pending' ? 'registrations' : activeTab}
            onValueChange={(value) => setActiveTab(value as ClassesTab)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="registrations">Registrations</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="registrations">
              {approvedRegistrationsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : approvedRegistrationsQuery.error ? (
                <EmptyCardState label="Failed to load approved registrations." />
              ) : (
                <RegistrationsTable registrations={approvedRegistrationsQuery.registrations} />
              )}
            </TabsContent>

            <TabsContent value="sessions" className="space-y-4">
              {!classItem.current_period_start ? (
                <Alert variant="warning">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Period Start Required</AlertTitle>
                  <AlertDescription>
                    Set a period start date before viewing sessions for the current period.
                  </AlertDescription>
                </Alert>
              ) : sessionsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : sessionsErrorLabel ? (
                <EmptyCardState label={sessionsErrorLabel} />
              ) : (
                <SessionsTable
                  sessions={sessionsQuery.sessions}
                  actionLabel={attendanceActionLabel}
                  onOpenAttendance={setSelectedSession}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ClassRegistrationDialog
        classItem={classItem}
        open={showRegistrationDialog}
        onOpenChange={setShowRegistrationDialog}
      />

      <ClassAttendanceDialog
        classId={classId}
        session={selectedSession}
        approvedRegistrations={approvedRegistrationsQuery.registrations}
        open={Boolean(selectedSession)}
        readOnly={!canManageAttendance}
        profileId={profile?.id ?? null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedSession(null)
          }
        }}
      />

      <Dialog
        open={showAddTrainerDialog}
        onOpenChange={(nextOpen) => {
          if (isSavingTrainer) {
            return
          }

          setShowAddTrainerDialog(nextOpen)
        }}
      >
        <DialogContent className="sm:max-w-md" isLoading={isSavingTrainer}>
          <DialogHeader>
            <DialogTitle>Add Trainer</DialogTitle>
            <DialogDescription>
              Assign a trainer-title staff profile to this class.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="class-trainer-select">Trainer</Label>
              <SearchableSelect
                value={selectedTrainerId || null}
                onValueChange={setSelectedTrainerId}
                options={availableTrainers.map((trainer) => ({
                  value: trainer.id,
                  label: trainer.name,
                  description: trainer.titles.join(', '),
                  keywords: trainer.titles,
                }))}
                placeholder={availableTrainers.length > 0 ? 'Select a trainer' : 'No trainers available'}
                searchPlaceholder="Search trainers..."
                emptyMessage="No matching trainers found."
                disabled={
                  isSavingTrainer ||
                  trainersQuery.isLoading ||
                  staffQuery.isLoading ||
                  Boolean(staffQuery.error) ||
                  availableTrainers.length === 0
                }
              />
            </div>

            {staffQuery.error ? (
              <p className="text-sm text-destructive">
                {staffQuery.error instanceof Error
                  ? staffQuery.error.message
                  : 'Failed to load available trainers.'}
              </p>
            ) : null}

            {availableTrainers.length === 0 && !staffQuery.isLoading && !staffQuery.error ? (
              <p className="text-sm text-muted-foreground">
                All trainer-title staff are already assigned to this class.
              </p>
            ) : null}

            {selectedTrainer ? (
              <div className="rounded-lg border p-3">
                <div className="font-medium">{selectedTrainer.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedTrainer.titles.map((title) => (
                    <Badge key={title} variant="outline">
                      {title}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddTrainerDialog(false)}
              disabled={isSavingTrainer}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={isSavingTrainer}
              onClick={() => void handleAddTrainer()}
              disabled={
                isSavingTrainer ||
                trainersQuery.isLoading ||
                staffQuery.isLoading ||
                Boolean(staffQuery.error) ||
                !selectedTrainer
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(trainerToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setTrainerToRemove(null)
          }
        }}
        title="Remove trainer from class?"
        description={
          trainerToRemove
            ? `${trainerToRemove.name} will no longer be assigned to ${classItem.name}.`
            : 'This trainer will no longer be assigned to this class.'
        }
        confirmLabel="Remove Trainer"
        cancelLabel="Cancel"
        onConfirm={() => void handleRemoveTrainer()}
        onCancel={() => setTrainerToRemove(null)}
        variant="destructive"
      />

      <Dialog open={showAddRuleDialog} onOpenChange={setShowAddRuleDialog}>
        <DialogContent className="sm:max-w-md" isLoading={isSavingScheduleRule}>
          <DialogHeader>
            <DialogTitle>Add Schedule Rule</DialogTitle>
            <DialogDescription>
              Add a recurring weekday and time used when generating current-period sessions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-rule-day">Day of week</Label>
              <Select
                value={String(scheduleRuleDay)}
                onValueChange={(value) => setScheduleRuleDay(Number(value) as ClassScheduleRuleDay)}
                disabled={isSavingScheduleRule}
              >
                <SelectTrigger id="schedule-rule-day">
                  <SelectValue placeholder="Select a day" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }).map((_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {getClassDayOfWeekLabel(index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-rule-time">Session time</Label>
              <Input
                id="schedule-rule-time"
                type="time"
                value={scheduleRuleTime}
                onChange={(event) => setScheduleRuleTime(event.target.value)}
                disabled={isSavingScheduleRule}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddRuleDialog(false)}
              disabled={isSavingScheduleRule}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleAddScheduleRule()} loading={isSavingScheduleRule}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" isLoading={isGeneratingSessions}>
          <DialogHeader>
            <DialogTitle>Generate Sessions</DialogTitle>
            <DialogDescription>
              Review the current-period session preview before creating class sessions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!classItem.current_period_start ? (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Period Start Required</AlertTitle>
                <AlertDescription>
                  Set a period start date before generating sessions.
                </AlertDescription>
              </Alert>
            ) : null}

            {sortedScheduleRules.length === 0 ? (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Schedule Rules Required</AlertTitle>
                <AlertDescription>
                  Add schedule rules before generating sessions.
                </AlertDescription>
              </Alert>
            ) : null}

            {classItem.current_period_start && sessionsQuery.sessions.length > 0 ? (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Sessions Already Exist</AlertTitle>
                <AlertDescription>
                  Sessions already exist for this period. You can still continue; duplicates will be
                  ignored server-side.
                </AlertDescription>
              </Alert>
            ) : null}

            {previewItems.length === 0 && classItem.current_period_start && sortedScheduleRules.length > 0 ? (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Preview Dates Remaining</AlertTitle>
                <AlertDescription>
                  Keep at least one preview date before confirming session generation.
                </AlertDescription>
              </Alert>
            ) : null}

            {previewItems.length > 0 ? (
              <div className="rounded-lg border">
                {previewItems.map((previewItem) => (
                  <div
                    key={previewItem.scheduled_at}
                    className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
                  >
                    <div>
                      <p className="font-medium">{formatClassDate(previewItem.date_value)}</p>
                      <p className="text-sm text-muted-foreground">
                        {getClassDayOfWeekLabel(previewItem.day_of_week)} at{' '}
                        {formatClassTime(previewItem.session_time)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${previewItem.scheduled_at}`}
                      disabled={isGeneratingSessions}
                      onClick={() =>
                        setPreviewItems((current) =>
                          current.filter(
                            (currentPreviewItem) =>
                              currentPreviewItem.scheduled_at !== previewItem.scheduled_at,
                          ),
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
              disabled={isGeneratingSessions}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateSessions()}
              disabled={
                isGeneratingSessions ||
                !classItem.current_period_start ||
                sortedScheduleRules.length === 0 ||
                previewItems.length === 0
              }
              loading={isGeneratingSessions}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPeriodDialog} onOpenChange={setShowPeriodDialog}>
        <DialogContent className="sm:max-w-md" isLoading={isSavingPeriod}>
          <DialogHeader>
            <DialogTitle>Set Billing Period Start</DialogTitle>
            <DialogDescription>
              Update the start date of the active 28-day billing period for this class.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="period-start">Current period start</Label>
              <Popover open={isPeriodPickerOpen} onOpenChange={setIsPeriodPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="period-start"
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                  >
                    <span>{displayedPeriodStart}</span>
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedPeriodStartDate ?? undefined}
                    onSelect={(date) => {
                      if (!date) {
                        return
                      }

                      setPeriodStart(
                        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
                          2,
                          '0',
                        )}-${String(date.getDate()).padStart(2, '0')}`,
                      )
                      setIsPeriodPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPeriodDialog(false)}
              disabled={isSavingPeriod}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleUpdatePeriodStart} loading={isSavingPeriod}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(approveRegistrationItem)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && isApproving) {
            return
          }

          if (!nextOpen) {
            setApproveRegistrationItem(null)
            setApproveAmount('')
            setApproveNote('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" isLoading={isApproving}>
          <DialogHeader>
            <DialogTitle>Approve Registration</DialogTitle>
            <DialogDescription>
              Confirm the registration details and adjust the final recorded amount if needed.
            </DialogDescription>
          </DialogHeader>

          {approveRegistrationItem ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span>{' '}
                    <span className="font-medium">{approveRegistrationItem.registrant_name}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Type:</span>{' '}
                    <span className="font-medium capitalize">
                      {approveRegistrationItem.registrant_type}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">First class date:</span>{' '}
                    <span className="font-medium">
                      {formatClassDate(approveRegistrationItem.month_start)}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Submitted:</span>{' '}
                    <span className="font-medium">
                      {formatClassDateTime(approveRegistrationItem.created_at)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approve-amount">Amount paid (JMD)</Label>
                <Input
                  id="approve-amount"
                  type="number"
                  min="0"
                  step="1"
                  value={approveAmount}
                  onChange={(event) => setApproveAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="approve-note">Review note</Label>
                <Textarea
                  id="approve-note"
                  value={approveNote}
                  onChange={(event) => setApproveNote(event.target.value)}
                  placeholder="Optional note"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveRegistrationItem(null)}
              disabled={isApproving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleApprove} loading={isApproving}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(denyRegistrationItem)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && isDenying) {
            return
          }

          if (!nextOpen) {
            setDenyRegistrationItem(null)
            setDenyReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" isLoading={isDenying}>
          <DialogHeader>
            <DialogTitle>Deny Registration</DialogTitle>
            <DialogDescription>
              Enter the reason for denying this class registration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              {denyRegistrationItem ? (
                <>
                  <p className="font-medium">{denyRegistrationItem.registrant_name}</p>
                  <p className="text-muted-foreground">
                    {formatClassDate(denyRegistrationItem.month_start)} ·{' '}
                    {denyRegistrationItem.registrant_type === 'member' ? 'Member' : 'Guest'}
                  </p>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="deny-reason">Reason</Label>
              <Textarea
                id="deny-reason"
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                placeholder="Explain why this registration is being denied."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDenyRegistrationItem(null)}
              disabled={isDenying}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeny} loading={isDenying}>
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
