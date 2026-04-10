'use client'

import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DialogStepForm, type DialogStep } from '@/components/dialog-step-form'
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
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
  formatOptionalJmd,
  getDefaultClassDateValue,
  isFreeMemberRegistration,
  type ClassWithTrainers,
  type CreateClassRegistrationInput,
} from '@/lib/classes'
import { parseDateInputValue } from '@/lib/member-access-time'
import { queryKeys } from '@/lib/query-keys'

type ClassRegistrationDialogProps = {
  classItem: ClassWithTrainers
  open: boolean
  onOpenChange: (open: boolean) => void
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

function getInitialDateValue() {
  return getDefaultClassDateValue()
}

export function ClassRegistrationDialog({
  classItem,
  open,
  onOpenChange,
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
  const [paymentReceived, setPaymentReceived] = useState(true)
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
  const canContinue =
    registrantType === 'member'
      ? Boolean(selectedMemberId)
      : Boolean(guestForm.name.trim())
  const isFreeRegistration = canContinue
    ? isFreeMemberRegistration(classItem, registrantType)
    : false
  const calculatedAmount = canContinue
    ? calculateClassRegistrationAmount({
        classItem,
        month_start: monthStart,
        registrant_type: registrantType,
      })
    : 0
  const effectiveAmountPaid = isFreeRegistration ? 0 : paymentReceived ? calculatedAmount : 0
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
    setPaymentReceived(true)
    setIsSubmitting(false)
    setIsDatePickerOpen(false)
  }, [open])

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
        amount_paid: effectiveAmountPaid,
        payment_received: isFreeRegistration ? false : paymentReceived,
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

      payload = {
        registrant_type: 'guest',
        guest: {
          name: guestForm.name.trim(),
          phone: guestForm.phone.trim() || null,
          email: guestForm.email.trim() || null,
          remark: guestForm.remark.trim() || null,
        },
        month_start: monthStart,
        amount_paid: effectiveAmountPaid,
        payment_received: paymentReceived,
      }
    }

    setIsSubmitting(true)

    try {
      await createClassRegistration(classItem.id, payload)
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
                  placeholder="Optional"
                />
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
      description: 'Confirm the first class date and review the amount to record for this registration.',
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

          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Calculated amount</p>
                <p className="text-2xl font-semibold">{formatOptionalJmd(calculatedAmount)}</p>
              </div>
              {isFreeRegistration ? (
                <p className="max-w-48 text-right text-sm text-muted-foreground">
                  Dance Cardio is included for active gym members.
                </p>
              ) : null}
            </div>
          </div>

          {!isFreeRegistration ? (
            <label className="flex items-center gap-3 rounded-lg border p-4">
              <Checkbox
                checked={paymentReceived}
                onCheckedChange={(checked) => setPaymentReceived(checked === true)}
              />
              <div>
                <p className="font-medium">Payment received</p>
                <p className="text-sm text-muted-foreground">
                  Uncheck this to save the registration with {formatOptionalJmd(0)} paid.
                </p>
              </div>
            </label>
          ) : null}

          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {isFreeRegistration
              ? 'No payment will be recorded for this registration.'
              : paymentReceived
                ? `The registration will be saved with ${formatOptionalJmd(effectiveAmountPaid)} paid.`
                : 'The registration will be saved with 0 JMD paid until payment is collected.'}
          </div>
        </div>
      ),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]" isLoading={isSubmitting}>
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
      </DialogContent>
    </Dialog>
  )
}
