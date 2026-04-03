'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { z } from 'zod'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
import { Textarea } from '@/components/ui/textarea'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  formatAccessDate,
  formatDateInputValue,
  parseDateInputValue,
  MEMBER_DURATION_OPTIONS,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import {
  addMember,
  MemberProvisioningError,
  uploadMemberPhoto,
} from '@/lib/member-actions'
import { compressImage } from '@/lib/compress-image'
import { queryKeys } from '@/lib/query-keys'
import { useAvailableCards } from '@/hooks/use-available-cards'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { formatAvailableAccessCardLabel } from '@/lib/available-cards'
import { buildMemberDisplayName, hasUsableCardCode } from '@/lib/member-name'
import { toast } from '@/hooks/use-toast'
import type { Member, MemberGender, MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

type AddMemberFormState = {
  name: string
  gender: MemberGender | ''
  email: string
  phone: string
  selectedInventoryCardNo: string
  type: MemberType
  remark: string
  startDate: string
  startTime: string
  duration: MemberDurationValue | ''
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']
const memberGenders: MemberGender[] = ['Male', 'Female']
const emailSchema = z.string().trim().email('Enter a valid email address.')

function createInitialFormState(now: Date = new Date()): AddMemberFormState {
  return {
    name: '',
    gender: '',
    email: '',
    phone: '',
    selectedInventoryCardNo: '',
    type: 'General',
    remark: '',
    startDate: formatDateInputValue(now),
    startTime: '00:00:00',
    duration: '',
  }
}

function getDefaultCardNo(cards: Array<{ cardNo: string; cardCode: string | null }>) {
  return cards.find((card) => hasUsableCardCode(card.cardCode))?.cardNo ?? cards[0]?.cardNo ?? ''
}

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const queryClient = useQueryClient()
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'provisioning_member'>('idle')
  const [formData, setFormData] = useState<AddMemberFormState>(() => createInitialFormState())
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
    refetch: refetchAvailableCards,
  } = useAvailableCards({ enabled: open })

  const isSubmitting = submissionStep !== 'idle'
  const hasNoAvailableCards = !isCardsLoading && availableCards.length === 0 && !cardsError
  const minimumStartDate = useMemo(() => formatDateInputValue(new Date()), [open])
  const selectedStartDate = useMemo(
    () => parseDateInputValue(formData.startDate),
    [formData.startDate],
  )
  const selectedInventoryCard = useMemo(
    () =>
      availableCards.find((card) => card.cardNo === formData.selectedInventoryCardNo) ?? null,
    [availableCards, formData.selectedInventoryCardNo],
  )
  const calculatedEndDate = useMemo(
    () =>
      formData.duration
        ? calculateInclusiveEndDate(formData.startDate, formData.duration)
        : null,
    [formData.duration, formData.startDate],
  )
  const calculatedBeginTime = useMemo(
    () => buildBeginTimeValue(formData.startDate, formData.startTime),
    [formData.startDate, formData.startTime],
  )
  const calculatedEndTime = useMemo(
    () => (calculatedEndDate ? buildEndTimeValue(calculatedEndDate) : null),
    [calculatedEndDate],
  )
  const displayedStartDate = useMemo(
    () => (selectedStartDate ? format(selectedStartDate, 'MMM d, yyyy') : 'Select a date'),
    [selectedStartDate],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setFormData((currentFormData) => {
      const nextSelectedInventoryCardNo = availableCards.some(
        (card) => card.cardNo === currentFormData.selectedInventoryCardNo,
      )
        ? currentFormData.selectedInventoryCardNo
        : getDefaultCardNo(availableCards)

      if (nextSelectedInventoryCardNo === currentFormData.selectedInventoryCardNo) {
        return currentFormData
      }

      return {
        ...currentFormData,
        selectedInventoryCardNo: nextSelectedInventoryCardNo,
      }
    })
  }, [availableCards, open])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSubmissionStep('idle')
      setIsStartDatePickerOpen(false)
      setPhotoFile(null)
      setFormData(createInitialFormState())
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the member’s full name before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!selectedInventoryCard?.cardNo) {
      toast({
        title: 'Select a card',
        description: 'Choose an available access card before creating the member.',
        variant: 'destructive',
      })
      return
    }

    const selectedCardCode = selectedInventoryCard.cardCode ?? ''

    if (!hasUsableCardCode(selectedCardCode)) {
      toast({
        title: 'Card code required',
        description: 'This card is missing its synced card code. Re-sync the imported cards and try again.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.startDate || !calculatedBeginTime) {
      toast({
        title: 'Start date required',
        description: 'Choose a valid access start date and time.',
        variant: 'destructive',
      })
      return
    }

    if (formData.startDate < minimumStartDate) {
      toast({
        title: 'Invalid start date',
        description: 'Choose today or a future date for access to begin.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.duration) {
      toast({
        title: 'Duration required',
        description: 'Choose how long this member should have access.',
        variant: 'destructive',
      })
      return
    }

    if (!calculatedEndDate || !calculatedEndTime) {
      toast({
        title: 'End date unavailable',
        description: 'The selected duration could not be converted into an access end date.',
        variant: 'destructive',
      })
      return
    }

    if (formData.email && !emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address or leave the field blank.',
        variant: 'destructive',
      })
      return
    }

    setSubmissionStep('provisioning_member')

    try {
      const member = await addMember(
        {
          name: formData.name.trim(),
          type: formData.type,
          ...(formData.gender ? { gender: formData.gender } : {}),
          ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
          ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
          ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
          beginTime: calculatedBeginTime,
          endTime: calculatedEndTime,
          cardNo: selectedInventoryCard.cardNo,
          cardCode: selectedCardCode,
        },
        {
          onStepChange: setSubmissionStep,
        },
      )

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadMemberPhoto(member.id, compressedPhoto)
          void queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) })
        } catch (photoError) {
          console.error('Failed to upload member photo:', photoError)
          toast({
            title: 'Photo upload failed',
            description:
              photoError instanceof Error
                ? `${photoError.message} The member was saved without a photo.`
                : 'The member was saved without a photo.',
            variant: 'destructive',
          })
        }
      }

      handleOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      ])
      onSuccess?.(member)
      toast({
        title: 'Member added',
        description: `${buildMemberDisplayName(member.name, member.cardCode)} was provisioned with card ${member.cardNo}.`,
      })
    } catch (error) {
      if (error instanceof MemberProvisioningError) {
        toast({
          title: 'Member creation failed',
          description: error.message,
          variant: 'destructive',
        })
      } else {
        console.error('Failed to add member:', error)
        toast({
          title: 'Member creation failed',
          description: error instanceof Error ? error.message : 'Failed to add member.',
          variant: 'destructive',
        })
      }
    } finally {
      setSubmissionStep('idle')
    }
  }

  const submitLabel =
    submissionStep === 'provisioning_member'
      ? 'Provisioning Access...'
      : 'Save Member'

  const progressDescription =
    submissionStep === 'provisioning_member'
      ? 'Creating the Hik member record and assigning the selected card.'
      : isCardsLoading
        ? 'Loading imported unassigned cards.'
        : cardsError
          ? 'Could not load imported cards. Refresh the inventory and try again.'
          : hasNoAvailableCards
            ? 'No imported unassigned cards are available. Import more cards into iVMS-4200 and re-sync.'
            : 'Enter the full member profile, choose an imported unassigned card, and confirm the access window.'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>{progressDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 py-2">
            {/* Row 1: Access Card — full width, prominent */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-number">Available Access Card</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={refetchAvailableCards}
                  disabled={isSubmitting || isCardsLoading}
                >
                  Refresh
                </Button>
              </div>
              <Select
                value={formData.selectedInventoryCardNo}
                onValueChange={(value) =>
                  setFormData({ ...formData, selectedInventoryCardNo: value })
                }
                disabled={isSubmitting || isCardsLoading || availableCards.length === 0}
              >
                <SelectTrigger id="card-number">
                  <SelectValue
                    placeholder={
                      isCardsLoading
                        ? 'Loading cards...'
                        : hasNoAvailableCards
                          ? 'No cards available'
                          : 'Select an access card'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableCards.map((card) => (
                    <SelectItem key={card.cardNo} value={card.cardNo}>
                      {formatAvailableAccessCardLabel(card)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isCardsLoading ? (
                <p className="text-xs text-muted-foreground">Fetching unassigned card records from Hik.</p>
              ) : cardsError ? (
                <p className="text-xs text-destructive">{cardsError}</p>
              ) : hasNoAvailableCards ? (
                <p className="text-xs text-muted-foreground">
                  No unassigned cards are currently available from the imported inventory.
                </p>
              ) : selectedInventoryCard && !selectedInventoryCard.cardCode ? (
                <p className="text-xs text-destructive">
                  This card is missing its synced card code and cannot be assigned until the next successful sync.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {availableCards.length} unassigned card{availableCards.length === 1 ? '' : 's'} loaded from Hik.
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Row 2: Full Name — full width */}
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                {selectedInventoryCard?.cardCode ? (
                  <span className="flex items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
                    {selectedInventoryCard.cardCode}
                  </span>
                ) : null}
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={
                    selectedInventoryCard?.cardCode
                      ? 'Enter member name'
                      : 'Select a card with a synced card code'
                  }
                  className="border-0 shadow-none focus-visible:ring-0"
                  disabled={!selectedInventoryCard?.cardCode}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The card code prefix is shown here for staff and sent to Hik automatically.
              </p>
            </div>

            {/* Row 3: Gender + Membership Type — 2 cols */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Gender</Label>
                <div className="grid grid-cols-2 gap-2">
                  {memberGenders.map((gender) => (
                    <Button
                      key={gender}
                      type="button"
                      variant={formData.gender === gender ? 'default' : 'outline'}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          gender: formData.gender === gender ? '' : gender,
                        })
                      }
                      disabled={isSubmitting}
                    >
                      {gender}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Membership Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: MemberType) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Email + Phone — 2 cols */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Optional email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Optional phone number"
                />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Row 5: Start Date + Start Time + Duration — 3 cols */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="start-date"
                      type="button"
                      variant="outline"
                      className="w-full justify-between px-3 text-left font-normal"
                      disabled={isSubmitting}
                    >
                      <span>{displayedStartDate}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedStartDate ?? undefined}
                      defaultMonth={selectedStartDate ?? undefined}
                      onSelect={(date) => {
                        if (!date) {
                          return
                        }

                        setFormData((currentFormData) => ({
                          ...currentFormData,
                          startDate: formatDateInputValue(date),
                        }))
                        setIsStartDatePickerOpen(false)
                      }}
                      disabled={(date) => formatDateInputValue(date) < minimumStartDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  step={1}
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value: MemberDurationValue) =>
                    setFormData({ ...formData, duration: value })
                  }
                >
                  <SelectTrigger id="duration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 6: End Date summary — full width */}
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</p>
                <p className="text-base font-semibold mt-0.5">
                  {calculatedEndTime ? formatAccessDate(calculatedEndTime, 'long') : 'Select a duration above'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-[200px]">
                Access always expires at 23:59:59 on the calculated end date.
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Row 7: Avatar — centered */}
            <div className="flex justify-center py-2">
              <Pattern onFileChange={setPhotoFile} />
            </div>

            <div className="h-px bg-border" />

            {/* Row 8: Remark — full width */}
            <div className="grid gap-2">
              <Label htmlFor="remark">Remark</Label>
              <Textarea
                id="remark"
                rows={3}
                value={formData.remark}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                placeholder="Add notes about this member..."
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedInventoryCard ||
                !selectedInventoryCard.cardCode ||
                isCardsLoading ||
                !formData.duration ||
                !calculatedBeginTime ||
                !calculatedEndTime
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
