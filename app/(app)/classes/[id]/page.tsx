'use client'

import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AddScheduleRuleDialog } from '@/components/class-detail/add-schedule-rule-dialog'
import { AddTrainerDialog } from '@/components/class-detail/add-trainer-dialog'
import { ApproveRegistrationDialog } from '@/components/class-detail/approve-registration-dialog'
import {
  EmptyCardState,
  InfoField,
  RegistrationsTable,
  SessionsTable,
} from '@/components/class-detail/class-detail-helpers'
import { DenyRegistrationDialog } from '@/components/class-detail/deny-registration-dialog'
import { EditRegistrationDialog } from '@/components/class-detail/edit-registration-dialog'
import { GenerateSessionsDialog } from '@/components/class-detail/generate-sessions-dialog'
import { RemoveRegistrationDialog } from '@/components/class-detail/remove-registration-dialog'
import { RemoveTrainerDialog } from '@/components/class-detail/remove-trainer-dialog'
import { SetBillingPeriodDialog } from '@/components/class-detail/set-billing-period-dialog'
import { ClassAttendanceDialog } from '@/components/class-attendance-dialog'
import { ClassRegistrationDialog } from '@/components/class-registration-dialog'
import { ClassRegistrationReceiptPreviewDialog } from '@/components/class-registration-receipt-preview-dialog'
import { RedirectOnMount } from '@/components/redirect-on-mount'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import {
  createClassRegistrationEditRequest,
  createClassRegistrationRemovalRequest,
} from '@/lib/class-registration-requests'
import {
  assignClassTrainer,
  calculateClassRegistrationAmount,
  createClassScheduleRule,
  deleteClassRegistration,
  getDefaultClassRegistrationFeeType,
  type ClassTrainerProfile,
  deleteClassScheduleRule,
  formatClassDate,
  formatClassTime,
  formatOptionalJmd,
  generateClassSessions,
  getClassDayOfWeekLabel,
  getClassSessionPreviewItems,
  getDefaultClassDateValue,
  removeClassTrainer,
  reviewClassRegistration,
  sortClassScheduleRules,
  updateClassRegistration,
  updateClassPeriodStart,
  type ClassRegistrationFeeType,
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

export default function ClassDetailPage() {
  const params = useParams()
  const router = useProgressRouter()
  const queryClient = useQueryClient()
  const { profile, loading } = useAuth()
  const { can } = usePermissions()
  const classId = params.id as string
  const canViewClasses = can('classes.view')
  const canRegisterForClasses = can('classes.register')
  const canManageClasses = can('classes.manage')
  const canManageAttendance = can('classes.markAttendance')
  const attendanceActionLabel = canManageAttendance ? 'Mark Attendance' : 'View Attendance'
  const backLink = useBackLink('/classes', '/classes')
  const { classItem, isLoading, error } = useClassDetail(classId, {
    enabled: !loading && canViewClasses,
  })
  const approvedRegistrationsQuery = useClassRegistrations(classId, 'approved', {
    enabled: !loading && canViewClasses,
  })
  const scheduleRulesQuery = useClassScheduleRules(classId, {
    enabled: !loading && canViewClasses,
  })
  const [activeTab, setActiveTab] = useState<ClassesTab>('registrations')
  const pendingRegistrationsQuery = useClassRegistrations(classId, 'pending', {
    enabled: !loading && canManageClasses && activeTab === 'pending',
  })
  const sessionsQuery = useClassSessions(classId, classItem?.current_period_start ?? null, {
    enabled: !loading && canViewClasses && Boolean(classItem?.current_period_start),
  })
  const trainersQuery = useClassTrainers(classId, {
    enabled: !loading && canManageClasses,
  })
  const staffQuery = useStaff({
    enabled: !loading && canManageClasses,
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
  const [approveFeeType, setApproveFeeType] = useState<ClassRegistrationFeeType>('custom')
  const [approveAmount, setApproveAmount] = useState('')
  const [approvePaymentReceived, setApprovePaymentReceived] = useState(false)
  const [approveRegistrationNotes, setApproveRegistrationNotes] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [editRegistrationItem, setEditRegistrationItem] =
    useState<ClassRegistrationListItem | null>(null)
  const [editPeriodStart, setEditPeriodStart] = useState(getDefaultClassDateValue)
  const [editFeeType, setEditFeeType] = useState<ClassRegistrationFeeType>('custom')
  const [editAmount, setEditAmount] = useState('')
  const [editPaymentReceived, setEditPaymentReceived] = useState(false)
  const [editRegistrationNotes, setEditRegistrationNotes] = useState('')
  const [removeRegistrationItem, setRemoveRegistrationItem] =
    useState<ClassRegistrationListItem | null>(null)
  const [classRegistrationReceiptId, setClassRegistrationReceiptId] = useState<string | null>(null)
  const [denyRegistrationItem, setDenyRegistrationItem] =
    useState<ClassRegistrationListItem | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [pendingAction, setPendingAction] = useState<
    null | 'period' | 'approve' | 'deny' | 'registration-edit' | 'registration-remove' | 'schedule-rule' | 'generate'
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
    if (canManageClasses || activeTab !== 'pending') {
      return
    }

    setActiveTab('registrations')
  }, [activeTab, canManageClasses])

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
  const isEditingRegistration = pendingAction === 'registration-edit'
  const isRemovingRegistration = pendingAction === 'registration-remove'
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

  const shouldOfferReceiptForRegistration = (registration: ClassRegistrationListItem) =>
    registration.amount_paid > 0 && Boolean(registration.registrant_email)

  const openApproveDialog = (registration: ClassRegistrationListItem) => {
    if (!classItem) {
      return
    }

    const nextFeeType = registration.fee_type ?? getDefaultClassRegistrationFeeType(classItem)
    const suggestedAmount =
      nextFeeType === 'custom' && registration.amount_paid > 0
        ? registration.amount_paid
        : calculateClassRegistrationAmount({
            classItem,
            fee_type: nextFeeType,
            custom_amount: registration.amount_paid,
          })
    const resolvedFeeType = suggestedAmount === null ? 'custom' : nextFeeType

    setApproveRegistrationItem(registration)
    setApproveFeeType(resolvedFeeType)
    setApproveAmount(
      resolvedFeeType === 'custom'
        ? String(suggestedAmount ?? registration.amount_paid)
        : '',
    )
    setApprovePaymentReceived(registration.amount_paid > 0)
    setApproveRegistrationNotes(registration.notes ?? '')
    setApproveNote(registration.review_note ?? '')
  }

  const openEditDialog = (registration: ClassRegistrationListItem) => {
    if (!classItem) {
      return
    }

    const nextFeeType = registration.fee_type ?? getDefaultClassRegistrationFeeType(classItem)
    const suggestedAmount =
      nextFeeType === 'custom' && registration.amount_paid > 0
        ? registration.amount_paid
        : calculateClassRegistrationAmount({
            classItem,
            fee_type: nextFeeType,
            custom_amount: registration.amount_paid,
          })
    const resolvedFeeType = suggestedAmount === null ? 'custom' : nextFeeType

    setEditRegistrationItem(registration)
    setEditPeriodStart(registration.month_start)
    setEditFeeType(resolvedFeeType)
    setEditAmount(
      resolvedFeeType === 'custom'
        ? String(suggestedAmount ?? registration.amount_paid)
        : '',
    )
    setEditPaymentReceived(registration.amount_paid > 0)
    setEditRegistrationNotes(registration.notes ?? '')
  }

  const openRemoveDialog = (registration: ClassRegistrationListItem) => {
    setRemoveRegistrationItem(registration)
  }

  const handleApprove = async () => {
    if (!approveRegistrationItem) {
      return
    }

    const parsedAmount = Number(approveAmount)
    const calculatedAmount = calculateClassRegistrationAmount({
      classItem: classItem!,
      fee_type: approveFeeType,
      custom_amount:
        Number.isFinite(parsedAmount) && Number.isInteger(parsedAmount) ? parsedAmount : null,
    })

    if (calculatedAmount === null) {
      toast({
        title: approveFeeType === 'custom' ? 'Custom fee required' : 'Fee not configured',
        description:
          approveFeeType === 'custom'
            ? 'Enter a whole-number JMD amount greater than 0 before submitting.'
            : 'The selected fee type is not configured for this class.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('approve')

    try {
      const registration = await reviewClassRegistration(classId, approveRegistrationItem.id, {
        status: 'approved',
        fee_type: approveFeeType,
        amount_paid: calculatedAmount,
        payment_received: approvePaymentReceived,
        notes: approveRegistrationNotes.trim() || null,
        review_note: approveNote.trim() || null,
      })
      await invalidateClassQueries()
      setApproveRegistrationItem(null)
      setApproveFeeType('custom')
      setApproveAmount('')
      setApprovePaymentReceived(false)
      setApproveRegistrationNotes('')
      setApproveNote('')
      if (shouldOfferReceiptForRegistration(registration)) {
        setClassRegistrationReceiptId(registration.id)
      }
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

  const handleEditRegistration = async () => {
    if (!editRegistrationItem || !classItem) {
      return
    }

    const parsedAmount = Number(editAmount)
    const calculatedAmount = calculateClassRegistrationAmount({
      classItem,
      fee_type: editFeeType,
      custom_amount:
        Number.isFinite(parsedAmount) && Number.isInteger(parsedAmount) ? parsedAmount : null,
    })

    if (calculatedAmount === null) {
      toast({
        title: editFeeType === 'custom' ? 'Custom fee required' : 'Fee not configured',
        description:
          editFeeType === 'custom'
            ? 'Enter a whole-number JMD amount greater than 0 before submitting.'
            : 'The selected fee type is not configured for this class.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('registration-edit')

    try {
      if (canManageClasses) {
        const result = await updateClassRegistration(editRegistrationItem.id, {
          period_start: editPeriodStart,
          fee_type: editFeeType,
          amount_paid: calculatedAmount,
          payment_received: editPaymentReceived,
          notes: editRegistrationNotes.trim() || null,
        })

        await invalidateClassQueries()
        setEditRegistrationItem(null)
        setEditPeriodStart(getDefaultClassDateValue())
        setEditFeeType('custom')
        setEditAmount('')
        setEditPaymentReceived(false)
        setEditRegistrationNotes('')
        if (result.amountChanged && shouldOfferReceiptForRegistration(result.registration)) {
          setClassRegistrationReceiptId(result.registration.id)
        }
        toast({
          title: 'Registration updated',
        })
      } else {
        await createClassRegistrationEditRequest(editRegistrationItem.id, {
          period_start: editPeriodStart,
          fee_type: editFeeType,
          amount_paid: calculatedAmount,
          payment_received: editPaymentReceived,
          notes: editRegistrationNotes.trim() || null,
        })
        await queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovalCounts.all })
        setEditRegistrationItem(null)
        setEditPeriodStart(getDefaultClassDateValue())
        setEditFeeType('custom')
        setEditAmount('')
        setEditPaymentReceived(false)
        setEditRegistrationNotes('')
        toast({
          title: 'Edit request submitted',
        })
      }
    } catch (editError) {
      toast({
        title: canManageClasses ? 'Update failed' : 'Request failed',
        description:
          editError instanceof Error
            ? editError.message
            : canManageClasses
              ? 'Failed to update the class registration.'
              : 'Failed to submit the edit request.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleRemoveRegistration = async () => {
    if (!removeRegistrationItem) {
      return
    }

    setPendingAction('registration-remove')

    try {
      if (canManageClasses) {
        await deleteClassRegistration(removeRegistrationItem.id)
        await invalidateClassQueries()
        setRemoveRegistrationItem(null)
        toast({
          title: 'Registration removed',
        })
      } else {
        await createClassRegistrationRemovalRequest(removeRegistrationItem.id)
        await queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovalCounts.all })
        setRemoveRegistrationItem(null)
        toast({
          title: 'Removal request submitted',
        })
      }
    } catch (removeError) {
      toast({
        title: canManageClasses ? 'Removal failed' : 'Request failed',
        description:
          removeError instanceof Error
            ? removeError.message
            : canManageClasses
              ? 'Failed to remove the class registration.'
              : 'Failed to submit the removal request.',
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

  if (!canViewClasses) {
    return (
      <RedirectOnMount
        href={getAuthenticatedHomePath(profile?.role ?? null, profile?.titles)}
      />
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
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageClasses ? (
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
              {canRegisterForClasses ? (
                <Button type="button" onClick={() => setShowRegistrationDialog(true)}>
                  Register
                </Button>
              ) : null}
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

        {canManageClasses ? (
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
        ) : (
          <Card className="flex flex-col">
            <CardHeader className="gap-4">
              <div>
                <CardTitle>Schedule</CardTitle>
                <CardDescription>Review the recurring class schedule.</CardDescription>
              </div>
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
                sortedScheduleRules.map((rule) => (
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
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {canViewClasses ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ClassesTab)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="registrations">Registrations</TabsTrigger>
              {canManageClasses ? (
                <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
              ) : null}
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="registrations">
              {approvedRegistrationsQuery.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : approvedRegistrationsQuery.error ? (
                <EmptyCardState label="Failed to load approved registrations." />
              ) : (
                <RegistrationsTable
                  registrations={approvedRegistrationsQuery.registrations}
                  showActions={canRegisterForClasses}
                  onEdit={canRegisterForClasses ? openEditDialog : undefined}
                  onRemove={canRegisterForClasses ? openRemoveDialog : undefined}
                />
              )}
            </TabsContent>

            {canManageClasses ? (
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
            ) : null}

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
                <RegistrationsTable
                  registrations={approvedRegistrationsQuery.registrations}
                  showActions={canRegisterForClasses}
                  onEdit={canRegisterForClasses ? openEditDialog : undefined}
                  onRemove={canRegisterForClasses ? openRemoveDialog : undefined}
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
        )}
      </div>

      {canRegisterForClasses ? (
        <ClassRegistrationDialog
          classItem={classItem}
          open={showRegistrationDialog}
          onOpenChange={setShowRegistrationDialog}
          onRegistered={(registration) => {
            if (shouldOfferReceiptForRegistration(registration)) {
              setClassRegistrationReceiptId(registration.id)
            }
          }}
        />
      ) : null}

      <ClassRegistrationReceiptPreviewDialog
        registrationId={classRegistrationReceiptId}
        open={Boolean(classRegistrationReceiptId)}
        onOpenChange={(open) => {
          if (!open) {
            setClassRegistrationReceiptId(null)
          }
        }}
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

      <EditRegistrationDialog
        classItem={classItem}
        canManageClasses={canManageClasses}
        editRegistrationItem={editRegistrationItem}
        setEditRegistrationItem={setEditRegistrationItem}
        editPeriodStart={editPeriodStart}
        setEditPeriodStart={setEditPeriodStart}
        editFeeType={editFeeType}
        setEditFeeType={setEditFeeType}
        editAmount={editAmount}
        setEditAmount={setEditAmount}
        editPaymentReceived={editPaymentReceived}
        setEditPaymentReceived={setEditPaymentReceived}
        editRegistrationNotes={editRegistrationNotes}
        setEditRegistrationNotes={setEditRegistrationNotes}
        isEditingRegistration={isEditingRegistration}
        onSubmit={handleEditRegistration}
      />

      <RemoveRegistrationDialog
        canManageClasses={canManageClasses}
        removeRegistrationItem={removeRegistrationItem}
        setRemoveRegistrationItem={setRemoveRegistrationItem}
        isRemovingRegistration={isRemovingRegistration}
        onConfirm={handleRemoveRegistration}
      />

      <AddTrainerDialog
        open={showAddTrainerDialog}
        setOpen={setShowAddTrainerDialog}
        isSavingTrainer={isSavingTrainer}
        selectedTrainerId={selectedTrainerId}
        setSelectedTrainerId={setSelectedTrainerId}
        availableTrainers={availableTrainers}
        selectedTrainer={selectedTrainer}
        staffError={staffQuery.error}
        staffLoading={staffQuery.isLoading}
        trainersLoading={trainersQuery.isLoading}
        onSave={handleAddTrainer}
      />

      <RemoveTrainerDialog
        classItemName={classItem.name}
        trainerToRemove={trainerToRemove}
        setTrainerToRemove={setTrainerToRemove}
        onConfirm={handleRemoveTrainer}
      />

      <AddScheduleRuleDialog
        open={showAddRuleDialog}
        setOpen={setShowAddRuleDialog}
        scheduleRuleDay={scheduleRuleDay}
        setScheduleRuleDay={setScheduleRuleDay}
        scheduleRuleTime={scheduleRuleTime}
        setScheduleRuleTime={setScheduleRuleTime}
        isSavingScheduleRule={isSavingScheduleRule}
        onSave={handleAddScheduleRule}
      />

      <GenerateSessionsDialog
        open={showGenerateDialog}
        setOpen={setShowGenerateDialog}
        isGeneratingSessions={isGeneratingSessions}
        currentPeriodStart={classItem.current_period_start}
        hasScheduleRules={sortedScheduleRules.length > 0}
        hasExistingSessions={sessionsQuery.sessions.length > 0}
        previewItems={previewItems}
        setPreviewItems={setPreviewItems}
        onConfirm={handleGenerateSessions}
      />

      <SetBillingPeriodDialog
        open={showPeriodDialog}
        setOpen={setShowPeriodDialog}
        isSavingPeriod={isSavingPeriod}
        isPeriodPickerOpen={isPeriodPickerOpen}
        setIsPeriodPickerOpen={setIsPeriodPickerOpen}
        displayedPeriodStart={displayedPeriodStart}
        selectedPeriodStartDate={selectedPeriodStartDate}
        setPeriodStart={setPeriodStart}
        onSave={handleUpdatePeriodStart}
      />

      <ApproveRegistrationDialog
        classItem={classItem}
        approveRegistrationItem={approveRegistrationItem}
        setApproveRegistrationItem={setApproveRegistrationItem}
        approveFeeType={approveFeeType}
        setApproveFeeType={setApproveFeeType}
        approveAmount={approveAmount}
        setApproveAmount={setApproveAmount}
        approvePaymentReceived={approvePaymentReceived}
        setApprovePaymentReceived={setApprovePaymentReceived}
        approveRegistrationNotes={approveRegistrationNotes}
        setApproveRegistrationNotes={setApproveRegistrationNotes}
        approveNote={approveNote}
        setApproveNote={setApproveNote}
        isApproving={isApproving}
        onApprove={handleApprove}
      />

      <DenyRegistrationDialog
        denyRegistrationItem={denyRegistrationItem}
        setDenyRegistrationItem={setDenyRegistrationItem}
        denyReason={denyReason}
        setDenyReason={setDenyReason}
        isDenying={isDenying}
        onDeny={handleDeny}
      />
    </>
  )
}
