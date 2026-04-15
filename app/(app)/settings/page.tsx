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
import { useMembershipExpiryEmailSettings } from '@/hooks/use-membership-expiry-email-settings'
import { useMemberTypes } from '@/hooks/use-member-types'
import {
  MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS,
  normalizeMembershipExpiryEmailSettingsInput,
  normalizeMembershipExpiryEmailDayOffsets,
  updateMembershipExpiryEmailSettings,
} from '@/lib/membership-expiry-email-settings'
import { formatMemberTypeRate, updateMemberTypeRate } from '@/lib/member-types'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'
import type { MemberTypeRecord, MembershipExpiryEmailLastRun, MembershipExpiryEmailSettings } from '@/types'

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
  const { memberTypes, isLoading, error } = useMemberTypes()
  const {
    settings: membershipExpiryEmailSettings,
    isLoading: isLoadingMembershipExpiryEmailSettings,
    error: membershipExpiryEmailSettingsError,
  } = useMembershipExpiryEmailSettings()
  const [editingMemberType, setEditingMemberType] = useState<MemberTypeRecord | null>(null)
  const [monthlyRateInput, setMonthlyRateInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
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

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      setEditingMemberType(null)
      setMonthlyRateInput('')
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

    setIsSaving(true)

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
      setIsSaving(false)
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
          {isLoading ? (
            <div className="space-y-3 px-6 pb-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load membership types.'}
              </p>
            </div>
          ) : memberTypes.length === 0 ? (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground">No membership types found.</p>
            </div>
          ) : (
            <Table size="compact">
              <TableHeader>
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

      <Dialog open={Boolean(editingMemberType)} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md" isLoading={isSaving}>
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
                onClick={() => handleDialogOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
