'use client'

import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAvailableCards } from '@/hooks/use-available-cards'
import { toast } from '@/hooks/use-toast'
import { formatAvailableAccessCardLabel } from '@/lib/available-cards'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  findMatchingMemberDuration,
  formatAccessDate,
  formatDateInputValue,
  getAccessDateInputValue,
  MEMBER_DURATION_OPTIONS,
  parseDateInputValue,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { assignMemberCard } from '@/lib/member-actions'
import { buildMemberDisplayName } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import type { Member } from '@/types'

type AssignCardModalProps = {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type AssignCardFormState = {
  selectedInventoryCardNo: string
  startDate: string
  duration: MemberDurationValue | ''
}

function getDefaultCardNo(cards: Array<{ cardNo: string }>) {
  return cards[0]?.cardNo ?? ''
}

function createInitialFormState(member: Member, now: Date = new Date()): AssignCardFormState {
  const today = formatDateInputValue(now)
  const startDate = getAccessDateInputValue(member.beginTime) || today
  const duration = findMatchingMemberDuration(member.beginTime, member.endTime) ?? ''

  return {
    selectedInventoryCardNo: '',
    startDate,
    duration,
  }
}

export function AssignCardModal({
  member,
  open,
  onOpenChange,
  onSuccess,
}: AssignCardModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<AssignCardFormState>(() => createInitialFormState(member))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false)
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
    refetch: refetchAvailableCards,
  } = useAvailableCards({ enabled: open })

  const hasNoAvailableCards = !isCardsLoading && availableCards.length === 0 && !cardsError
  const selectedInventoryCard = useMemo(
    () => availableCards.find((card) => card.cardNo === formData.selectedInventoryCardNo) ?? null,
    [availableCards, formData.selectedInventoryCardNo],
  )
  const selectedStartDate = useMemo(
    () => parseDateInputValue(formData.startDate),
    [formData.startDate],
  )
  const displayedStartDate = useMemo(
    () => (selectedStartDate ? format(selectedStartDate, 'MMM d, yyyy') : 'Select a date'),
    [selectedStartDate],
  )
  const calculatedEndDate = useMemo(
    () =>
      formData.duration
        ? calculateInclusiveEndDate(formData.startDate, formData.duration)
        : null,
    [formData.duration, formData.startDate],
  )
  const calculatedBeginTime = useMemo(
    () => buildBeginTimeValue(formData.startDate, '00:00:00'),
    [formData.startDate],
  )
  const calculatedEndTime = useMemo(
    () => (calculatedEndDate ? buildEndTimeValue(calculatedEndDate) : null),
    [calculatedEndDate],
  )
  const memberDisplayName = buildMemberDisplayName(member.name, member.cardCode)
  const progressDescription = isSubmitting
    ? `Assigning the selected access card to ${memberDisplayName}.`
    : isCardsLoading
      ? 'Loading imported unassigned cards.'
      : cardsError
        ? 'Could not load imported cards. Refresh the inventory and try again.'
        : hasNoAvailableCards
          ? 'No imported unassigned cards are available. Import more cards into iVMS-4200 and re-sync.'
          : `Choose an imported unassigned card and confirm the access window for ${memberDisplayName}.`

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

  useEffect(() => {
    if (!open) {
      setFormData(createInitialFormState(member))
      setIsSubmitting(false)
      setIsStartDatePickerOpen(false)
      return
    }

    setFormData((currentFormData) => ({
      ...createInitialFormState(member),
      selectedInventoryCardNo: currentFormData.selectedInventoryCardNo,
    }))
  }, [member, open])

  const resetModalState = () => {
    setFormData(createInitialFormState(member))
    setIsSubmitting(false)
    setIsStartDatePickerOpen(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) {
      return
    }

    if (!nextOpen) {
      resetModalState()
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!selectedInventoryCard?.cardNo) {
      toast({
        title: 'Select a card',
        description: 'Choose an available access card before confirming.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.startDate || !calculatedBeginTime) {
      toast({
        title: 'Start date required',
        description: 'Choose a valid start date before assigning the card.',
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

    setIsSubmitting(true)

    try {
      const updatedMember = await assignMemberCard(member.id, {
        cardNo: selectedInventoryCard.cardNo,
        beginTime: calculatedBeginTime,
        endTime: calculatedEndTime,
      })

      resetModalState()
      onOpenChange(false)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      ])
      onSuccess?.()
      toast({
        title: 'Card assigned',
        description: `Card ${updatedMember.cardNo} was assigned to ${buildMemberDisplayName(updatedMember.name, updatedMember.cardCode)}.`,
      })
    } catch (error) {
      console.error('Failed to assign member card:', error)
      toast({
        title: 'Card assignment failed',
        description: error instanceof Error ? error.message : 'Failed to assign this member card.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" isLoading={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Assign Card</DialogTitle>
          <DialogDescription>{progressDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="assign-card-number">Available Access Card</Label>
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
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    selectedInventoryCardNo: value,
                  }))
                }
                disabled={isSubmitting || isCardsLoading || availableCards.length === 0}
              >
                <SelectTrigger id="assign-card-number">
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
              ) : (
                <p className="text-xs text-muted-foreground">
                  {availableCards.length} unassigned card{availableCards.length === 1 ? '' : 's'} loaded from Hik.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="assign-start-date">Start Date</Label>
                <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="assign-start-date"
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
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="assign-duration">Duration</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value: MemberDurationValue) =>
                    setFormData((currentFormData) => ({
                      ...currentFormData,
                      duration: value,
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="assign-duration">
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

            <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
              <Label>Access Window</Label>
              <p className="text-lg font-semibold">
                {calculatedBeginTime && calculatedEndTime
                  ? `${formatAccessDate(calculatedBeginTime, 'long')} to ${formatAccessDate(calculatedEndTime, 'long')}`
                  : 'Choose a start date and duration'}
              </p>
              <p className="text-xs text-muted-foreground">
                Access begins at 00:00:00 on the start date and ends at 23:59:59 on the calculated end date.
              </p>
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
                isCardsLoading ||
                !formData.duration ||
                !calculatedBeginTime ||
                !calculatedEndTime
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              loading={isSubmitting}
            >
              {isSubmitting ? 'Assigning Card...' : 'Assign Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
