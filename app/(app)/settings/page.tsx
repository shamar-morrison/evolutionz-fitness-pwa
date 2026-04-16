'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useCardFeeSettings } from '@/hooks/use-card-fee-settings'
import { useClasses } from '@/hooks/use-classes'
import { useMembershipExpiryEmailSettings } from '@/hooks/use-membership-expiry-email-settings'
import { useMemberTypes } from '@/hooks/use-member-types'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import {
  formatCardFeeAmount,
  updateCardFeeSettings,
} from '@/lib/card-fee-settings'
import {
  formatOptionalJmd,
  type ClassWithTrainers,
  type UpdateClassSettingsInput,
  updateClassSettings,
} from '@/lib/classes'
import {
  MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS,
  normalizeMembershipExpiryEmailSettingsInput,
  normalizeMembershipExpiryEmailDayOffsets,
  updateMembershipExpiryEmailSettings,
} from '@/lib/membership-expiry-email-settings'
import { formatMemberTypeRate, updateMemberTypeRate } from '@/lib/member-types'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'
import type {
  CardFeeSettings,
  MemberTypeRecord,
  MembershipExpiryEmailLastRun,
  MembershipExpiryEmailSettings,
} from '@/types'

function formatLastRunTimestamp(value: string | null) {
  if (!value) {
    return 'Not recorded'
  }

  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return 'Not recorded'
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedValue)
}

function formatLastRunStatus(lastRun: MembershipExpiryEmailLastRun | null) {
  if (!lastRun) {
    return 'Not run yet'
  }

  if (lastRun.status === 'idle') {
    return 'Idle'
  }

  return `${lastRun.status.slice(0, 1).toUpperCase()}${lastRun.status.slice(1)}`
}

type ClassSettingsValidationErrors = {
  monthly_fee?: string
  per_session_fee?: string
  trainer_compensation_percent?: string
}

function validateClassSettingsInput({
  monthlyFeeInput,
  perSessionFeeInput,
  trainerCompensationInput,
}: {
  monthlyFeeInput: string
  perSessionFeeInput: string
  trainerCompensationInput: string
}): {
  errors: ClassSettingsValidationErrors
  parsedInput: UpdateClassSettingsInput | null
} {
  const errors: ClassSettingsValidationErrors = {}
  const normalizedMonthlyFeeInput = monthlyFeeInput.trim()
  const normalizedPerSessionFeeInput = perSessionFeeInput.trim()
  const normalizedTrainerCompensationInput = trainerCompensationInput.trim()

  if (!normalizedMonthlyFeeInput) {
    errors.monthly_fee = 'Monthly fee is required.'
  }

  const monthlyFee = Number(normalizedMonthlyFeeInput)

  if (
    normalizedMonthlyFeeInput &&
    (!Number.isFinite(monthlyFee) || monthlyFee <= 0)
  ) {
    errors.monthly_fee = 'Monthly fee must be greater than zero.'
  }

  let perSessionFee: number | null = null

  if (normalizedPerSessionFeeInput) {
    const parsedPerSessionFee = Number(normalizedPerSessionFeeInput)

    if (!Number.isFinite(parsedPerSessionFee) || parsedPerSessionFee <= 0) {
      errors.per_session_fee = 'Per session fee must be greater than zero or left blank.'
    } else {
      perSessionFee = parsedPerSessionFee
    }
  }

  if (!normalizedTrainerCompensationInput) {
    errors.trainer_compensation_percent = 'Trainer compensation is required.'
  }

  const trainerCompensationPercent = Number(normalizedTrainerCompensationInput)

  if (
    normalizedTrainerCompensationInput &&
    (!Number.isFinite(trainerCompensationPercent) ||
      trainerCompensationPercent < 0 ||
      trainerCompensationPercent > 100)
  ) {
    errors.trainer_compensation_percent = 'Trainer compensation must be between 0 and 100.'
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      parsedInput: null,
    }
  }

  return {
    errors: {},
    parsedInput: {
      monthly_fee: monthlyFee,
      per_session_fee: perSessionFee,
      trainer_compensation_percent: trainerCompensationPercent,
    },
  }
}

function MembershipExpiryEmailSettingsSection({
  settings,
  isLoading,
  error,
  isSaving,
  hasUnsavedChanges,
  dayOffsetInput,
  enabled,
  dayOffsets,
  subjectTemplate,
  bodyTemplate,
  onDayOffsetInputChange,
  onEnabledChange,
  onSubjectTemplateChange,
  onBodyTemplateChange,
  onAddOffset,
  onRemoveOffset,
  onSubmit,
}: {
  settings: MembershipExpiryEmailSettings | null
  isLoading: boolean
  error: Error | null
  isSaving: boolean
  hasUnsavedChanges: boolean
  dayOffsetInput: string
  enabled: boolean
  dayOffsets: number[]
  subjectTemplate: string
  bodyTemplate: string
  onDayOffsetInputChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
  onSubjectTemplateChange: (value: string) => void
  onBodyTemplateChange: (value: string) => void
  onAddOffset: () => void
  onRemoveOffset: (value: number) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <CardTitle className="text-lg tracking-tight">Membership Expiry Emails</CardTitle>
        <CardDescription>
          Manage automated reminder emails for members whose access is about to expire.
        </CardDescription>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
          <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : !settings ? (
        <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Membership expiry email settings are unavailable right now.
        </div>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={onSubmit}>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <label className="flex items-start gap-3">
              <input
                id="membership-expiry-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(event) => onEnabledChange(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-foreground"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">
                  Enable reminder emails
                </span>
                <span className="block text-sm text-muted-foreground">
                  When enabled, the daily cron will send emails for the configured day offsets.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="membership-expiry-day-offset"
                className="text-sm font-medium text-foreground"
              >
                Reminder offsets
              </label>
              <p className="text-sm text-muted-foreground">
                Add one or more whole-number day offsets before the member&apos;s `end_time`.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="membership-expiry-day-offset"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={dayOffsetInput}
                onChange={(event) => onDayOffsetInputChange(event.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 sm:max-w-[180px]"
                placeholder="e.g. 7"
              />
              <button
                type="button"
                onClick={onAddOffset}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
              >
                Add Offset
              </button>
            </div>

            <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-dashed border-border bg-background/60 p-3">
              {dayOffsets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reminder offsets configured.</p>
              ) : (
                dayOffsets.map((dayOffset) => (
                  <span
                    key={dayOffset}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm"
                  >
                    {dayOffset} day{dayOffset === 1 ? '' : 's'} before expiry
                    <button
                      type="button"
                      onClick={() => onRemoveOffset(dayOffset)}
                      className="text-muted-foreground transition hover:text-foreground"
                      aria-label={`Remove ${dayOffset} day offset`}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="membership-expiry-subject-template"
              className="text-sm font-medium text-foreground"
            >
              Subject template
            </label>
            <input
              id="membership-expiry-subject-template"
              type="text"
              value={subjectTemplate}
              onChange={(event) => onSubjectTemplateChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="membership-expiry-body-template"
              className="text-sm font-medium text-foreground"
            >
              Body template
            </label>
            <textarea
              id="membership-expiry-body-template"
              value={bodyTemplate}
              onChange={(event) => onBodyTemplateChange(event.target.value)}
              rows={11}
              className="w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              disabled={isSaving}
            />
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">Supported tokens</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use these tokens in the subject or body template.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS.map((token) => (
                <code
                  key={token}
                  className="rounded-md bg-background px-2 py-1 text-xs text-foreground"
                >
                  {token}
                </code>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-medium text-foreground">Last run summary</h3>
              <span className="text-sm text-muted-foreground">
                Status: {formatLastRunStatus(settings.lastRun)}
              </span>
            </div>

            {settings.lastRun ? (
              <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="font-medium text-foreground">Started</p>
                  <p>{formatLastRunTimestamp(settings.lastRun.startedAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Completed</p>
                  <p>{formatLastRunTimestamp(settings.lastRun.completedAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Sent</p>
                  <p>{settings.lastRun.sentCount}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Skipped</p>
                  <p>{settings.lastRun.skippedCount}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Duplicates</p>
                  <p>{settings.lastRun.duplicateCount}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Errors</p>
                  <p>{settings.lastRun.errorCount}</p>
                </div>
                {settings.lastRun.message ? (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="font-medium text-foreground">Message</p>
                    <p>{settings.lastRun.message}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No reminder runs have completed yet.</p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? 'Saving...' : 'Save Reminder Settings'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

export default function SettingsPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <SettingsPageContent />
    </RoleGuard>
  )
}

function SettingsPageContent() {
  const queryClient = useQueryClient()
  const {
    memberTypes,
    isLoading: isLoadingMemberTypes,
    error: memberTypesError,
  } = useMemberTypes()
  const {
    classes,
    isLoading: isLoadingClasses,
    error: classesError,
  } = useClasses()
  const {
    settings: cardFeeSettings,
    isLoading: isLoadingCardFeeSettings,
    error: cardFeeSettingsError,
  } = useCardFeeSettings()
  const {
    settings: membershipExpiryEmailSettings,
    isLoading: isLoadingMembershipExpiryEmailSettings,
    error: membershipExpiryEmailSettingsError,
  } = useMembershipExpiryEmailSettings()
  const [editingMemberType, setEditingMemberType] = useState<MemberTypeRecord | null>(null)
  const [monthlyRateInput, setMonthlyRateInput] = useState('')
  const [isSavingMemberType, setIsSavingMemberType] = useState(false)
  const [editingCardFeeSettings, setEditingCardFeeSettings] = useState<CardFeeSettings | null>(null)
  const [cardFeeAmountInput, setCardFeeAmountInput] = useState('')
  const [isSavingCardFeeSettings, setIsSavingCardFeeSettings] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassWithTrainers | null>(null)
  const [classMonthlyFeeInput, setClassMonthlyFeeInput] = useState('')
  const [classPerSessionFeeInput, setClassPerSessionFeeInput] = useState('')
  const [classTrainerCompensationInput, setClassTrainerCompensationInput] = useState('')
  const [classSettingsErrors, setClassSettingsErrors] = useState<ClassSettingsValidationErrors>({})
  const [isSavingClassSettings, setIsSavingClassSettings] = useState(false)
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [dayOffsetInput, setDayOffsetInput] = useState('')
  const [dayOffsets, setDayOffsets] = useState<number[]>([])
  const [subjectTemplate, setSubjectTemplate] = useState('')
  const [bodyTemplate, setBodyTemplate] = useState('')
  const [isSavingMembershipExpiryEmailSettings, setIsSavingMembershipExpiryEmailSettings] =
    useState(false)
  const [isMembershipExpiryEmailSettingsHydrated, setIsMembershipExpiryEmailSettingsHydrated] =
    useState(false)
  const normalizedDraftMembershipExpiryEmailSettings = normalizeMembershipExpiryEmailSettingsInput({
    enabled: remindersEnabled,
    dayOffsets,
    subjectTemplate,
    bodyTemplate,
  })
  const normalizedSavedMembershipExpiryEmailSettings = membershipExpiryEmailSettings
    ? normalizeMembershipExpiryEmailSettingsInput({
        enabled: membershipExpiryEmailSettings.enabled,
        dayOffsets: membershipExpiryEmailSettings.dayOffsets,
        subjectTemplate: membershipExpiryEmailSettings.subjectTemplate,
        bodyTemplate: membershipExpiryEmailSettings.bodyTemplate,
      })
    : null

  const hasUnsavedMembershipExpiryEmailSettingsChanges = normalizedSavedMembershipExpiryEmailSettings
    ? isMembershipExpiryEmailSettingsHydrated &&
      JSON.stringify(normalizedDraftMembershipExpiryEmailSettings) !==
        JSON.stringify(normalizedSavedMembershipExpiryEmailSettings)
    : false

  useEffect(() => {
    if (!membershipExpiryEmailSettings) {
      setIsMembershipExpiryEmailSettingsHydrated(false)
      return
    }

    setRemindersEnabled(membershipExpiryEmailSettings.enabled)
    setDayOffsets(membershipExpiryEmailSettings.dayOffsets)
    setSubjectTemplate(membershipExpiryEmailSettings.subjectTemplate)
    setBodyTemplate(membershipExpiryEmailSettings.bodyTemplate)
    setIsMembershipExpiryEmailSettingsHydrated(true)
  }, [membershipExpiryEmailSettings])

  const handleEditClick = (memberType: MemberTypeRecord) => {
    setEditingMemberType(memberType)
    setMonthlyRateInput(String(memberType.monthly_rate))
  }

  const handleMemberTypeDialogOpenChange = (open: boolean) => {
    if (!open && !isSavingMemberType) {
      setEditingMemberType(null)
      setMonthlyRateInput('')
    }
  }

  const handleCardFeeEditClick = (settings: CardFeeSettings) => {
    setEditingCardFeeSettings(settings)
    setCardFeeAmountInput(String(settings.amountJmd))
  }

  const handleCardFeeDialogOpenChange = (open: boolean) => {
    if (!open && !isSavingCardFeeSettings) {
      setEditingCardFeeSettings(null)
      setCardFeeAmountInput('')
    }
  }

  const handleClassEditClick = (classItem: ClassWithTrainers) => {
    setEditingClass(classItem)
    setClassMonthlyFeeInput(classItem.monthly_fee === null ? '' : String(classItem.monthly_fee))
    setClassPerSessionFeeInput(
      classItem.per_session_fee === null ? '' : String(classItem.per_session_fee),
    )
    setClassTrainerCompensationInput(String(classItem.trainer_compensation_pct))
    setClassSettingsErrors({})
  }

  const handleClassDialogOpenChange = (open: boolean) => {
    if (!open && !isSavingClassSettings) {
      setEditingClass(null)
      setClassMonthlyFeeInput('')
      setClassPerSessionFeeInput('')
      setClassTrainerCompensationInput('')
      setClassSettingsErrors({})
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingMemberType) {
      return
    }

    const parsedRate = Number(monthlyRateInput)

    if (!Number.isFinite(parsedRate) || parsedRate <= 0 || !Number.isInteger(parsedRate)) {
      toast({
        title: 'Invalid rate',
        description: 'Enter a whole-number monthly rate in JMD.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingMemberType(true)

    try {
      await updateMemberTypeRate(editingMemberType.id, {
        monthly_rate: parsedRate,
      })

      await queryClient.invalidateQueries({ queryKey: queryKeys.memberTypes.all })

      toast({
        title: 'Rate updated',
        description: `${editingMemberType.name} now uses ${formatMemberTypeRate(parsedRate)}.`,
      })

      setEditingMemberType(null)
      setMonthlyRateInput('')
    } catch (saveError) {
      toast({
        title: 'Update failed',
        description:
          saveError instanceof Error
            ? saveError.message
            : 'Unable to update the membership type rate.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingMemberType(false)
    }
  }

  const handleClassSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingClass) {
      return
    }

    const { errors, parsedInput } = validateClassSettingsInput({
      monthlyFeeInput: classMonthlyFeeInput,
      perSessionFeeInput: classPerSessionFeeInput,
      trainerCompensationInput: classTrainerCompensationInput,
    })

    if (!parsedInput) {
      setClassSettingsErrors(errors)
      return
    }

    setClassSettingsErrors({})
    setIsSavingClassSettings(true)

    try {
      await updateClassSettings(editingClass.id, parsedInput)

      await queryClient.invalidateQueries({
        queryKey: queryKeys.classes.all,
        exact: false,
      })

      toast({
        title: 'Class settings updated',
        description: `${editingClass.name} will use the updated fees and trainer compensation going forward.`,
      })

      setEditingClass(null)
      setClassMonthlyFeeInput('')
      setClassPerSessionFeeInput('')
      setClassTrainerCompensationInput('')
      setClassSettingsErrors({})
    } catch (saveError) {
      toast({
        title: 'Update failed',
        description:
          saveError instanceof Error ? saveError.message : 'Unable to update the class settings.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingClassSettings(false)
    }
  }

  const handleCardFeeSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingCardFeeSettings) {
      return
    }

    const parsedAmount = Number(cardFeeAmountInput)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isInteger(parsedAmount)) {
      toast({
        title: 'Invalid card fee amount',
        description: 'Enter a whole-number card fee amount in JMD.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingCardFeeSettings(true)

    try {
      const updatedSettings = await updateCardFeeSettings({
        amountJmd: parsedAmount,
      })

      queryClient.setQueryData(queryKeys.cardFeeSettings.settings, updatedSettings)

      await queryClient.invalidateQueries({
        queryKey: queryKeys.cardFeeSettings.settings,
      })

      toast({
        title: 'Card fee updated',
        description: `New card fee payments will use ${formatCardFeeAmount(parsedAmount)}.`,
      })

      setEditingCardFeeSettings(null)
      setCardFeeAmountInput('')
    } catch (saveError) {
      toast({
        title: 'Card fee update failed',
        description:
          saveError instanceof Error
            ? saveError.message
            : 'Unable to update the card fee settings.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingCardFeeSettings(false)
    }
  }

  const handleAddDayOffset = () => {
    const parsedValue = Number(dayOffsetInput)

    if (!Number.isFinite(parsedValue) || parsedValue <= 0 || !Number.isInteger(parsedValue)) {
      toast({
        title: 'Invalid reminder offset',
        description: 'Enter a whole number of days greater than zero.',
        variant: 'destructive',
      })
      return
    }

    const normalizedOffsets = normalizeMembershipExpiryEmailDayOffsets([...dayOffsets, parsedValue])

    if (normalizedOffsets.length === dayOffsets.length) {
      toast({
        title: 'Offset already added',
        description: 'That reminder offset is already configured.',
        variant: 'destructive',
      })
      return
    }

    setDayOffsets(normalizedOffsets)
    setDayOffsetInput('')
  }

  const handleRemoveDayOffset = (value: number) => {
    setDayOffsets((currentValue) => currentValue.filter((dayOffset) => dayOffset !== value))
  }

  const handleMembershipExpiryEmailSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedSubjectTemplate = subjectTemplate.trim()
    const normalizedBodyTemplate = bodyTemplate.replace(/\r\n/g, '\n').trim()

    if (!normalizedSubjectTemplate) {
      toast({
        title: 'Subject required',
        description: 'Enter an email subject template before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!normalizedBodyTemplate) {
      toast({
        title: 'Body required',
        description: 'Enter an email body template before saving.',
        variant: 'destructive',
      })
      return
    }

    if (remindersEnabled && dayOffsets.length === 0) {
      toast({
        title: 'Reminder offsets required',
        description: 'Add at least one reminder day offset before enabling reminder emails.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingMembershipExpiryEmailSettings(true)

    try {
      const updatedSettings = await updateMembershipExpiryEmailSettings({
        enabled: remindersEnabled,
        dayOffsets,
        subjectTemplate: normalizedSubjectTemplate,
        bodyTemplate: normalizedBodyTemplate,
      })

      queryClient.setQueryData(queryKeys.membershipExpiryEmails.settings, updatedSettings)

      await queryClient.invalidateQueries({
        queryKey: queryKeys.membershipExpiryEmails.settings,
      })

      toast({
        title: 'Reminder settings updated',
        description: 'Membership expiry reminder emails will use the new configuration.',
      })
    } catch (saveError) {
      toast({
        title: 'Reminder settings update failed',
        description:
          saveError instanceof Error
            ? saveError.message
            : 'Unable to update the reminder email settings.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingMembershipExpiryEmailSettings(false)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      <Card className="mt-8 overflow-hidden gap-4 py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-lg tracking-tight">Membership Types</CardTitle>
          <CardDescription>
            Configure monthly rates for each membership type. Rates apply to new payments going
            forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {isLoadingMemberTypes ? (
            <div className="space-y-3 px-6 pb-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : memberTypesError ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-destructive">
                {memberTypesError instanceof Error
                  ? memberTypesError.message
                  : 'Failed to load membership types.'}
              </p>
            </div>
          ) : memberTypes.length === 0 ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">No membership types found.</p>
            </div>
          ) : (
            <Table size="compact">
              <TableHeader className='bg-gray-100'>
                <TableRow>
                  <TableHead>Type name</TableHead>
                  <TableHead>Monthly rate</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberTypes.map((memberType) => (
                  <TableRow key={memberType.id}>
                    <TableCell className="font-medium">{memberType.name}</TableCell>
                    <TableCell>{formatMemberTypeRate(memberType.monthly_rate)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(memberType)}
                        >
                          Edit Rate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8 overflow-hidden gap-4 py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-lg tracking-tight">Card Fee</CardTitle>
          <CardDescription>
            Configure the card fee amount in JMD. Changes apply to new card-fee payments and
            requests going forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {isLoadingCardFeeSettings ? (
            <div className="space-y-3 px-6 pb-6">
              <Skeleton className="h-12 w-full" />
            </div>
          ) : cardFeeSettingsError ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-destructive">
                {cardFeeSettingsError instanceof Error
                  ? cardFeeSettingsError.message
                  : 'Failed to load card fee settings.'}
              </p>
            </div>
          ) : !cardFeeSettings ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">Card fee settings are unavailable right now.</p>
            </div>
          ) : (
            <Table size="compact">
              <TableHeader className='bg-gray-100'>
                <TableRow>
                  <TableHead>Setting</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Card fee amount</TableCell>
                  <TableCell>{formatCardFeeAmount(cardFeeSettings.amountJmd)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCardFeeEditClick(cardFeeSettings)}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8 overflow-hidden gap-4 py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-lg tracking-tight">Class Settings</CardTitle>
          <CardDescription>
            Configure fees and trainer compensation for each class. Changes apply to new billing
            periods going forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {isLoadingClasses ? (
            <div className="space-y-3 px-6 pb-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : classesError ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-destructive">
                {classesError instanceof Error ? classesError.message : 'Failed to load classes.'}
              </p>
            </div>
          ) : classes.length === 0 ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">No classes found.</p>
            </div>
          ) : (
            <Table size="compact">
              <TableHeader className='bg-gray-100'>
                <TableRow>
                  <TableHead>Class name</TableHead>
                  <TableHead>Monthly fee</TableHead>
                  <TableHead>Per session fee</TableHead>
                  <TableHead>Trainer compensation</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classItem) => (
                  <TableRow key={classItem.id}>
                    <TableCell className="font-medium">{classItem.name}</TableCell>
                    <TableCell>{formatOptionalJmd(classItem.monthly_fee)}</TableCell>
                    <TableCell>{formatOptionalJmd(classItem.per_session_fee)}</TableCell>
                    <TableCell>{`${classItem.trainer_compensation_pct}%`}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleClassEditClick(classItem)}
                        >
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MembershipExpiryEmailSettingsSection
        settings={membershipExpiryEmailSettings}
        isLoading={isLoadingMembershipExpiryEmailSettings}
        error={membershipExpiryEmailSettingsError instanceof Error ? membershipExpiryEmailSettingsError : null}
        isSaving={isSavingMembershipExpiryEmailSettings}
        hasUnsavedChanges={hasUnsavedMembershipExpiryEmailSettingsChanges}
        dayOffsetInput={dayOffsetInput}
        enabled={remindersEnabled}
        dayOffsets={dayOffsets}
        subjectTemplate={subjectTemplate}
        bodyTemplate={bodyTemplate}
        onDayOffsetInputChange={setDayOffsetInput}
        onEnabledChange={setRemindersEnabled}
        onSubjectTemplateChange={setSubjectTemplate}
        onBodyTemplateChange={setBodyTemplate}
        onAddOffset={handleAddDayOffset}
        onRemoveOffset={handleRemoveDayOffset}
        onSubmit={(event) => void handleMembershipExpiryEmailSettingsSave(event)}
      />

      <PushNotificationsSection />

      <Dialog open={Boolean(editingMemberType)} onOpenChange={handleMemberTypeDialogOpenChange}>
        <DialogContent className="sm:max-w-md" isLoading={isSavingMemberType}>
          <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
            <DialogHeader>
              <DialogTitle>{editingMemberType?.name ?? 'Edit Rate'}</DialogTitle>
              <DialogDescription>Update the monthly rate in JMD.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="member-type-monthly-rate">Monthly rate (JMD)</Label>
              <Input
                id="member-type-monthly-rate"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={monthlyRateInput}
                onChange={(event) => setMonthlyRateInput(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleMemberTypeDialogOpenChange(false)}
                disabled={isSavingMemberType}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSavingMemberType}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingClass)} onOpenChange={handleClassDialogOpenChange}>
        <DialogContent className="sm:max-w-md" isLoading={isSavingClassSettings}>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => void handleClassSettingsSave(event)}
          >
            <DialogHeader>
              <DialogTitle>Edit Class Settings</DialogTitle>
              <DialogDescription>
                Update class fees and trainer compensation for future billing periods.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="class-settings-name">Class name</Label>
              <Input id="class-settings-name" value={editingClass?.name ?? ''} readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-settings-monthly-fee">Monthly fee (JMD)</Label>
              <Input
                id="class-settings-monthly-fee"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={classMonthlyFeeInput}
                onChange={(event) => {
                  setClassMonthlyFeeInput(event.target.value)
                  setClassSettingsErrors((currentValue) => ({
                    ...currentValue,
                    monthly_fee: undefined,
                  }))
                }}
                aria-invalid={Boolean(classSettingsErrors.monthly_fee)}
              />
              {classSettingsErrors.monthly_fee ? (
                <p className="text-xs text-destructive">{classSettingsErrors.monthly_fee}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-settings-per-session-fee">Per session fee (JMD)</Label>
              <Input
                id="class-settings-per-session-fee"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={classPerSessionFeeInput}
                onChange={(event) => {
                  setClassPerSessionFeeInput(event.target.value)
                  setClassSettingsErrors((currentValue) => ({
                    ...currentValue,
                    per_session_fee: undefined,
                  }))
                }}
                aria-invalid={Boolean(classSettingsErrors.per_session_fee)}
              />
              {classSettingsErrors.per_session_fee ? (
                <p className="text-xs text-destructive">{classSettingsErrors.per_session_fee}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-settings-trainer-compensation">
                Trainer compensation (%)
              </Label>
              <Input
                id="class-settings-trainer-compensation"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={classTrainerCompensationInput}
                onChange={(event) => {
                  setClassTrainerCompensationInput(event.target.value)
                  setClassSettingsErrors((currentValue) => ({
                    ...currentValue,
                    trainer_compensation_percent: undefined,
                  }))
                }}
                aria-invalid={Boolean(classSettingsErrors.trainer_compensation_percent)}
              />
              {classSettingsErrors.trainer_compensation_percent ? (
                <p className="text-xs text-destructive">
                  {classSettingsErrors.trainer_compensation_percent}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClassDialogOpenChange(false)}
                disabled={isSavingClassSettings}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSavingClassSettings}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCardFeeSettings)} onOpenChange={handleCardFeeDialogOpenChange}>
        <DialogContent className="sm:max-w-md" isLoading={isSavingCardFeeSettings}>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => void handleCardFeeSettingsSave(event)}
          >
            <DialogHeader>
              <DialogTitle>Edit Card Fee</DialogTitle>
              <DialogDescription>
                Update the card fee amount in JMD for new payments and requests.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="card-fee-amount">Card fee amount (JMD)</Label>
              <Input
                id="card-fee-amount"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={cardFeeAmountInput}
                onChange={(event) => setCardFeeAmountInput(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCardFeeDialogOpenChange(false)}
                disabled={isSavingCardFeeSettings}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSavingCardFeeSettings}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PushNotificationsSection() {
  const { isSupported, permission, isSubscribed, requestPermission, unsubscribe } =
    usePushNotifications()
  const [isPending, setIsPending] = useState(false)

  const handleEnable = async () => {
    setIsPending(true)
    try {
      await requestPermission()
    } catch (error) {
      toast({
        title: 'Could not enable push notifications',
        description: error instanceof Error ? error.message : 'Unexpected error.',
        variant: 'destructive',
      })
    } finally {
      setIsPending(false)
    }
  }

  const handleDisable = async () => {
    setIsPending(true)
    try {
      await unsubscribe()
    } catch (error) {
      toast({
        title: 'Could not disable push notifications',
        description: error instanceof Error ? error.message : 'Unexpected error.',
        variant: 'destructive',
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <CardTitle className="text-lg tracking-tight">Push Notifications</CardTitle>
        <CardDescription>
          Get native notifications on this device when a new request needs your attention — even
          when the app is closed.
        </CardDescription>
      </div>

      <div className="mt-6">
        {!isSupported ? (
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported on this device.
          </p>
        ) : permission === 'denied' ? (
          <p className="text-sm text-muted-foreground">
            Push notifications are blocked. Enable them in your browser settings to continue.
          </p>
        ) : isSubscribed ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-emerald-600">
              Push notifications enabled on this device.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDisable()}
              loading={isPending}
            >
              Disable
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => void handleEnable()} loading={isPending}>
            Enable push notifications
          </Button>
        )}
      </div>
    </section>
  )
}
