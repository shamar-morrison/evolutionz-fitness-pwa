'use client'

import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { DialogStepForm, type DialogStep } from '@/components/dialog-step-form'
import { ClassRegistrationFeeFields } from '@/components/class-registration-fee-fields'
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { useMembers } from '@/hooks/use-members'
import { usePermissions } from '@/hooks/use-permissions'
import { toast } from '@/hooks/use-toast'
import {
  calculateClassRegistrationAmount,
  createClassRegistration,
  getDefaultClassDateValue,
  getDefaultClassRegistrationFeeType,
  type ClassWithTrainers,
  type CreateClassRegistrationInput,
} from '@/lib/classes'
import { parseDateInputValue } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'
import type { ClassRegistrationFeeType } from '@/types'

type ClassRegistrationDialogProps = {
  classItem: ClassWithTrainers
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered?: (registration: Awaited<ReturnType<typeof createClassRegistration>>) => void
}

type GuestFormState = {
  name: string
  phone: string
  email: string
  remark: string
}

const EMPTY_GUEST_FORM: GuestFormState = {
  name: '',
  phone: '',
  email: '',
  remark: '',
}
const guestEmailSchema = z.string().trim().email('Enter a valid email address.')

function getInitialDateValue() {
  return getDefaultClassDateValue()
}

export function ClassRegistrationDialog({
  classItem,
  open,
  onOpenChange,
  onRegistered,
}: ClassRegistrationDialogProps) {
  const queryClient = useQueryClient()
  const { requiresApproval } = usePermissions()
  const { members, isLoading: isMembersLoading, error: membersError } = useMembers({
    status: 'Active',
  })
  const [currentStep, setCurrentStep] = useState(1)
  const [registrantType, setRegistrantType] = useState<'member' | 'guest'>('member')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [guestForm, setGuestForm] = useState<GuestFormState>(EMPTY_GUEST_FORM)
  const [monthStart, setMonthStart] = useState(getInitialDateValue)
  const [feeType, setFeeType] = useState<ClassRegistrationFeeType>(() =>
    getDefaultClassRegistrationFeeType(classItem),
  )
  const [customAmount, setCustomAmount] = useState('')
  const [paymentReceived, setPaymentReceived] = useState(true)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  const memberOptions = useMemo<SearchableSelectOption[]>(
    () =>
      members.map((member) => ({
        value: member.id,
        label: member.name,
        description: `${member.employeeNo} · ${member.type}`,
        keywords: [member.employeeNo, member.type],
      })),
    [members],
  )
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  )
  const registrantLabel =
    registrantType === 'member'
      ? selectedMember?.name ?? 'No member selected'
      : guestForm.name.trim() || 'Guest details not entered'
  const selectedMonthStartDate = useMemo(
    () => parseDateInputValue(monthStart),
    [monthStart],
  )
  const displayedMonthStart = selectedMonthStartDate
    ? format(selectedMonthStartDate, 'MMM d, yyyy')
    : 'Select a date'
  const trimmedGuestEmail = guestForm.email.trim()
  const guestEmailValidation =
    trimmedGuestEmail.length > 0 ? guestEmailSchema.safeParse(trimmedGuestEmail) : null
  const guestEmailError =
    guestEmailValidation && !guestEmailValidation.success
      ? guestEmailValidation.error.issues[0]?.message ?? 'Enter a valid email address.'
      : null
  const canContinue =
    registrantType === 'member'
      ? Boolean(selectedMemberId)
      : Boolean(guestForm.name.trim() && trimmedGuestEmail && !guestEmailError)
  const parsedCustomAmount = Number(customAmount)
  const calculatedAmount = canContinue
    ? calculateClassRegistrationAmount({
        classItem,
        fee_type: feeType,
        custom_amount:
          Number.isFinite(parsedCustomAmount) && Number.isInteger(parsedCustomAmount)
            ? parsedCustomAmount
            : null,
      })
    : null
  const registrationNeedsApproval = requiresApproval('classes.register')

  useEffect(() => {
    if (open) {
      return
    }

    setCurrentStep(1)
    setRegistrantType('member')
    setSelectedMemberId(null)
    setGuestForm(EMPTY_GUEST_FORM)
    setMonthStart(getInitialDateValue())
    setFeeType(getDefaultClassRegistrationFeeType(classItem))
    setCustomAmount('')
    setPaymentReceived(true)
    setNotes('')
    setIsSubmitting(false)
    setIsDatePickerOpen(false)
  }, [classItem, open])

  const handleGuestFieldChange = <TField extends keyof GuestFormState>(
    field: TField,
    value: GuestFormState[TField],
  ) => {
    setGuestForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) {
      return
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canContinue) {
      return
    }

    if (
      feeType === 'custom' &&
      (customAmount.trim() === '' ||
        !Number.isFinite(parsedCustomAmount) ||
        !Number.isInteger(parsedCustomAmount) ||
        parsedCustomAmount < 1)
    ) {
      toast({
        title: 'Custom fee required',
        description: 'Enter a whole-number JMD amount greater than 0 before submitting.',
        variant: 'destructive',
      })
      return
    }

    if (calculatedAmount === null) {
      toast({
        title: 'Fee not configured',
        description: 'The selected fee type is not configured for this class.',
        variant: 'destructive',
      })
      return
    }

    let payload: CreateClassRegistrationInput

    if (registrantType === 'member') {
      if (!selectedMemberId) {
        toast({
          title: 'Member required',
          description: 'Select a member before submitting.',
          variant: 'destructive',
        })
        return
      }

      payload = {
        registrant_type: 'member',
        member_id: selectedMemberId,
        month_start: monthStart,
        fee_type: feeType,
        amount_paid: calculatedAmount,
        payment_received: paymentReceived,
        notes: notes.trim() || null,
      }
    } else {
      if (!guestForm.name.trim()) {
        toast({
          title: 'Guest name required',
          description: 'Enter the guest name before submitting.',
          variant: 'destructive',
        })
        return
      }

      if (!guestForm.email.trim()) {
        toast({
          title: 'Guest email required',
          description: 'Enter the guest email before submitting.',
          variant: 'destructive',
        })
        return
      }

      if (guestEmailError) {
        return
      }

      payload = {
        registrant_type: 'guest',
        guest: {
          name: guestForm.name.trim(),
          phone: guestForm.phone.trim() || null,
          email: trimmedGuestEmail,
          remark: guestForm.remark.trim() || null,
        },
        month_start: monthStart,
        fee_type: feeType,
        amount_paid: calculatedAmount,
        payment_received: paymentReceived,
        notes: notes.trim() || null,
      }
    }

    setIsSubmitting(true)

    try {
      const registration = await createClassRegistration(classItem.id, payload)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.classes.registrations(classItem.id, ''),
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.classes.all,
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ['classes', 'sessions', classItem.id],
          exact: false,
        }),
      ])

      try {
        onRegistered?.(registration)
      } catch (callbackError) {
        console.error('Class registration succeeded but onRegistered failed:', callbackError)
      }

      onOpenChange(false)
      toast({
        title: registrationNeedsApproval ? 'Registration submitted' : 'Registration added',
        description:
          registrationNeedsApproval
            ? `${registrantLabel}'s registration was submitted for approval.`
            : `${registrantLabel} was registered for ${classItem.name}.`,
      })
    } catch (error) {
      toast({
        title: 'Registration failed',
        description:
          error instanceof Error ? error.message : 'Failed to create the class registration.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps: DialogStep[] = [
    {
      title: 'Select the Registrant',
      description: 'Choose whether this registration is for an active gym member or a guest.',
      content: (
        <div className="space-y-5">
          <div className="space-y-3">
            <Label>Registrant type</Label>
            <RadioGroup
              value={registrantType}
              onValueChange={(value) => setRegistrantType(value as 'member' | 'guest')}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                <RadioGroupItem value="member" id="registrant-member" />
                <div>
                  <p className="font-medium">Gym Member</p>
                  <p className="text-sm text-muted-foreground">Choose from active members.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                <RadioGroupItem value="guest" id="registrant-guest" />
                <div>
                  <p className="font-medium">Guest</p>
                  <p className="text-sm text-muted-foreground">Capture guest details inline.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {registrantType === 'member' ? (
            <div className="space-y-2">
              <Label htmlFor="class-member-select">Member</Label>
              <SearchableSelect
                value={selectedMemberId}
                onValueChange={setSelectedMemberId}
                options={memberOptions}
                placeholder={isMembersLoading ? 'Loading members...' : 'Select a member'}
                searchPlaceholder="Search members"
                emptyMessage="No active members found."
                disabled={isMembersLoading}
              />
              {membersError ? (
                <p className="text-sm text-destructive">
                  {membersError instanceof Error
                    ? membersError.message
                    : 'Failed to load active members.'}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="guest-name">Guest name</Label>
                <Input
                  id="guest-name"
                  value={guestForm.name}
                  onChange={(event) => handleGuestFieldChange('name', event.target.value)}
                  placeholder="Enter the guest name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-phone">Phone</Label>
                <Input
                  id="guest-phone"
                  value={guestForm.phone}
                  onChange={(event) => handleGuestFieldChange('phone', event.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-email">Email</Label>
                <Input
                  id="guest-email"
                  type="email"
                  value={guestForm.email}
                  onChange={(event) => handleGuestFieldChange('email', event.target.value)}
                  placeholder="Required"
                  required
                  aria-invalid={guestEmailError ? true : undefined}
                />
                {guestEmailError ? (
                  <p className="text-sm text-destructive">{guestEmailError}</p>
                ) : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="guest-remark">Remark</Label>
                <Textarea
                  id="guest-remark"
                  value={guestForm.remark}
                  onChange={(event) => handleGuestFieldChange('remark', event.target.value)}
                  placeholder="Optional note"
                />
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Set the Period and Payment',
      description: 'Confirm the period start, fee type, payment status, and notes for this registration.',
      content: (
        <div className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Registrant</p>
            <p className="font-medium">{registrantLabel}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="class-month-start">First class date</Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="class-month-start"
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <span>{displayedMonthStart}</span>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedMonthStartDate ?? undefined}
                  onSelect={(date) => {
                    if (!date) {
                      return
                    }

                    setMonthStart(
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
                        2,
                        '0',
                      )}-${String(date.getDate()).padStart(2, '0')}`,
                    )
                    setIsDatePickerOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <ClassRegistrationFeeFields
            classItem={classItem}
            feeType={feeType}
            customAmount={customAmount}
            paymentReceived={paymentReceived}
            notes={notes}
            onFeeTypeChange={setFeeType}
            onCustomAmountChange={setCustomAmount}
            onPaymentReceivedChange={setPaymentReceived}
            onNotesChange={setNotes}
          />
        </div>
      ),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0" isLoading={isSubmitting}>
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-h-[calc(100dvh-4rem)]">
          <DialogStepForm
            steps={steps}
            currentStep={currentStep}
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
            onBack={() => setCurrentStep(1)}
            onNext={() => setCurrentStep(2)}
            onSubmit={handleSubmit}
            nextDisabled={!canContinue}
            submitLabel={registrationNeedsApproval ? 'Submit for Approval' : 'Register'}
            submitLoadingLabel={registrationNeedsApproval ? 'Submitting...' : 'Registering...'}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
