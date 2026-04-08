'use client'

import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { type Dispatch, type SetStateAction } from 'react'
import { Pattern } from '@/components/ui/file-upload'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { formatAvailableAccessCardLabel } from '@/lib/available-cards'
import {
  formatAccessDate,
  formatDateInputValue,
  MEMBER_DURATION_OPTIONS,
  parseDateInputValue,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { hasUsableCardCode } from '@/lib/member-name'
import type { AvailableAccessCard, MemberGender, MemberType } from '@/types'

export type MemberFormState = {
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
  photoFile: FileWithPreview | null
}

type SharedMemberFieldsProps = {
  idPrefix: string
  formData: MemberFormState
  setFormData: Dispatch<SetStateAction<MemberFormState>>
  isSubmitting: boolean
}

type MemberBasicFieldsProps = SharedMemberFieldsProps & {
  availableCards: AvailableAccessCard[]
  cardsError: string | null
  hasNoAvailableCards: boolean
  isCardsLoading: boolean
  onRefreshCards: () => void
  selectedInventoryCard: AvailableAccessCard | null
}

type MemberAccessFieldsProps = SharedMemberFieldsProps & {
  calculatedEndTime: string | null
  isStartDatePickerOpen: boolean
  minimumStartDate: string
  setIsStartDatePickerOpen: Dispatch<SetStateAction<boolean>>
}

type MemberExtrasFieldsProps = Pick<
  SharedMemberFieldsProps,
  'formData' | 'idPrefix' | 'setFormData'
> & {
  defaultPhotoUrl?: string | null
  setPhotoFile: (file: FileWithPreview | null) => void
}

const MEMBER_TYPES: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']
const MEMBER_GENDERS: MemberGender[] = ['Male', 'Female']

export function createInitialMemberFormState(now: Date = new Date()): MemberFormState {
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
    photoFile: null,
  }
}

export function getDefaultMemberCardNo(cards: AvailableAccessCard[]) {
  return cards.find((card) => hasUsableCardCode(card.cardCode))?.cardNo ?? cards[0]?.cardNo ?? ''
}

export function MemberBasicFields({
  availableCards,
  cardsError,
  formData,
  hasNoAvailableCards,
  idPrefix,
  isCardsLoading,
  isSubmitting,
  onRefreshCards,
  selectedInventoryCard,
  setFormData,
}: MemberBasicFieldsProps) {
  const selectedCardCode = selectedInventoryCard?.cardCode ?? ''
  const hasSelectedCardCode = hasUsableCardCode(selectedCardCode)

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-card-number`}>Available Access Card</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefreshCards}
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
          <SelectTrigger id={`${idPrefix}-card-number`}>
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
        ) : selectedInventoryCard && !hasSelectedCardCode ? (
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

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Full Name</Label>
        <div className="flex overflow-hidden rounded-md border border-input bg-background">
          {hasSelectedCardCode ? (
            <span className="flex items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
              {selectedCardCode.trim()}
            </span>
          ) : null}
          <Input
            id={`${idPrefix}-name`}
            value={formData.name}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                name: event.target.value,
              }))
            }
            placeholder={
              hasSelectedCardCode
                ? 'Enter member name'
                : 'Select a card with a synced card code'
            }
            className="border-0 shadow-none focus-visible:ring-0"
            disabled={!hasSelectedCardCode}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The card code prefix is shown here for staff and sent to Hik automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Gender</Label>
          <div className="grid grid-cols-2 gap-2">
            {MEMBER_GENDERS.map((gender) => (
              <Button
                key={gender}
                type="button"
                variant={formData.gender === gender ? 'default' : 'outline'}
                onClick={() =>
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    gender: currentFormData.gender === gender ? '' : gender,
                  }))
                }
                disabled={isSubmitting}
              >
                {gender}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-type`}>Membership Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value: MemberType) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                type: value,
              }))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger id={`${idPrefix}-type`}>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={formData.email}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                email: event.target.value,
              }))
            }
            placeholder="Optional email"
            disabled={isSubmitting}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
          <Input
            id={`${idPrefix}-phone`}
            value={formData.phone}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                phone: event.target.value,
              }))
            }
            placeholder="Optional phone number"
            disabled={isSubmitting}
          />
        </div>
      </div>
    </div>
  )
}

export function MemberAccessFields({
  calculatedEndTime,
  formData,
  idPrefix,
  isStartDatePickerOpen,
  isSubmitting,
  minimumStartDate,
  setFormData,
  setIsStartDatePickerOpen,
}: MemberAccessFieldsProps) {
  const selectedStartDate = parseDateInputValue(formData.startDate)
  const displayedStartDate = selectedStartDate
    ? format(selectedStartDate, 'MMM d, yyyy')
    : 'Select a date'

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-start-date`}>Start Date</Label>
          <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${idPrefix}-start-date`}
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
          <Label htmlFor={`${idPrefix}-start-time`}>Start Time</Label>
          <Input
            id={`${idPrefix}-start-time`}
            type="time"
            step={1}
            value={formData.startTime}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                startTime: event.target.value,
              }))
            }
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-duration`}>Duration</Label>
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
            <SelectTrigger id={`${idPrefix}-duration`}>
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

      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</p>
          <p className="mt-0.5 text-base font-semibold">
            {calculatedEndTime ? formatAccessDate(calculatedEndTime, 'long') : 'Select a duration above'}
          </p>
        </div>
        <p className="max-w-[200px] text-right text-xs text-muted-foreground">
          Access always expires at 23:59:59 on the calculated end date.
        </p>
      </div>
    </div>
  )
}

export function MemberExtrasFields({
  defaultPhotoUrl,
  formData,
  idPrefix,
  setFormData,
  setPhotoFile,
}: MemberExtrasFieldsProps) {
  const handlePhotoChange = (file: FileWithPreview | null) => {
    setPhotoFile(file)
    setFormData((currentFormData) => ({
      ...currentFormData,
      photoFile: file,
    }))
  }

  return (
    <div className="grid gap-4 py-2">
      <div className="flex justify-center py-2">
        <Pattern
          onFileChange={handlePhotoChange}
          defaultAvatar={defaultPhotoUrl ?? undefined}
          selectedFile={formData.photoFile}
        />
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-remark`}>Remark</Label>
        <Textarea
          id={`${idPrefix}-remark`}
          rows={3}
          value={formData.remark}
          onChange={(event) =>
            setFormData((currentFormData) => ({
              ...currentFormData,
              remark: event.target.value,
            }))
          }
          placeholder="Add notes about this member..."
          className="resize-none"
        />
      </div>
    </div>
  )
}
