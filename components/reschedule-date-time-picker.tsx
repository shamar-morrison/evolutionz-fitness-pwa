'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateInputValue, parseDateInputValue } from '@/lib/member-access-time'
import { buildJamaicaScheduledAt, getJamaicaDateValue } from '@/lib/pt-scheduling'
import { cn } from '@/lib/utils'

const RESCHEDULE_HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
const RESCHEDULE_MINUTE_OPTIONS = [
  '00',
  '05',
  '10',
  '15',
  '20',
  '25',
  '30',
  '35',
  '40',
  '45',
  '50',
  '55',
] as const

type RescheduleMeridiem = 'AM' | 'PM'
type RescheduleMinute = (typeof RESCHEDULE_MINUTE_OPTIONS)[number]
type RescheduleTimeSelection = {
  hour12: number
  minute: RescheduleMinute
  meridiem: RescheduleMeridiem
}

type RescheduleDateTimePickerProps = {
  id: string
  value: string
  onValueChange: (value: string) => void
  onValidationChange?: (message: string | null) => void
  placeholder?: string
  disabled?: boolean
}

function parseRescheduleLocalDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/u.exec(value.trim())

  if (!match) {
    return null
  }

  const [, dateValue, hoursPart, minutePart] = match
  const hours24 = Number(hoursPart)

  if (
    !parseDateInputValue(dateValue) ||
    !Number.isInteger(hours24) ||
    hours24 < 0 ||
    hours24 > 23 ||
    !RESCHEDULE_MINUTE_OPTIONS.includes(minutePart as RescheduleMinute)
  ) {
    return null
  }

  return {
    dateValue,
    hour12: hours24 % 12 === 0 ? 12 : hours24 % 12,
    minute: minutePart as RescheduleMinute,
    meridiem: hours24 >= 12 ? 'PM' : 'AM',
  } as const
}

function buildRescheduleTimeValue(
  hour12: number,
  minute: RescheduleMinute,
  meridiem: RescheduleMeridiem,
) {
  if (!RESCHEDULE_HOUR_OPTIONS.includes(hour12 as (typeof RESCHEDULE_HOUR_OPTIONS)[number])) {
    return null
  }

  if (!RESCHEDULE_MINUTE_OPTIONS.includes(minute)) {
    return null
  }

  const normalizedHour = hour12 % 12
  const hours24 = meridiem === 'AM' ? normalizedHour : normalizedHour + 12

  return `${String(hours24).padStart(2, '0')}:${minute}`
}

function buildReschedulePayloadValue(
  dateValue: string,
  hour12: number,
  minute: RescheduleMinute,
  meridiem: RescheduleMeridiem,
) {
  const timeValue = buildRescheduleTimeValue(hour12, minute, meridiem)

  return timeValue ? `${dateValue}T${timeValue}` : null
}

function buildRescheduleScheduledAt(
  dateValue: string,
  hour12: number,
  minute: RescheduleMinute,
  meridiem: RescheduleMeridiem,
) {
  const timeValue = buildRescheduleTimeValue(hour12, minute, meridiem)

  return timeValue ? buildJamaicaScheduledAt(dateValue, timeValue) : null
}

function formatRescheduleDateLabel(dateValue: string) {
  const date = parseDateInputValue(dateValue)

  if (!date) {
    return dateValue
  }

  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRescheduleTimeLabel(
  hour12: number,
  minute: RescheduleMinute,
  meridiem: RescheduleMeridiem,
) {
  return `${hour12}:${minute} ${meridiem}`
}

function isFutureRescheduleSelection(
  dateValue: string,
  hour12: number,
  minute: RescheduleMinute,
  meridiem: RescheduleMeridiem,
) {
  const scheduledAt = buildRescheduleScheduledAt(dateValue, hour12, minute, meridiem)

  return scheduledAt ? new Date(scheduledAt).getTime() > Date.now() : false
}

function getFirstAvailableRescheduleTime(dateValue: string): RescheduleTimeSelection | null {
  for (let hours24 = 0; hours24 < 24; hours24 += 1) {
    for (const minute of RESCHEDULE_MINUTE_OPTIONS) {
      const meridiem = hours24 >= 12 ? 'PM' : 'AM'
      const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12

      if (isFutureRescheduleSelection(dateValue, hour12, minute, meridiem)) {
        return {
          hour12,
          minute,
          meridiem,
        }
      }
    }
  }

  return null
}

function getAvailableMinutes(
  dateValue: string,
  hour12: number | null,
  meridiem: RescheduleMeridiem | null,
) {
  if (!hour12 || !meridiem) {
    return []
  }

  return RESCHEDULE_MINUTE_OPTIONS.filter((minute) =>
    isFutureRescheduleSelection(dateValue, hour12, minute, meridiem),
  )
}

export function RescheduleDateTimePicker({
  id,
  value,
  onValueChange,
  onValidationChange,
  placeholder = 'Select a new date and time',
  disabled = false,
}: RescheduleDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDateValue, setSelectedDateValue] = useState('')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [selectedMinute, setSelectedMinute] = useState<RescheduleMinute | null>(null)
  const [selectedMeridiem, setSelectedMeridiem] = useState<RescheduleMeridiem | null>(null)
  const todayDateValue = getJamaicaDateValue(new Date().toISOString()) ?? formatDateInputValue(new Date())

  useEffect(() => {
    const parsed = parseRescheduleLocalDateTime(value)

    setSelectedDateValue(parsed?.dateValue ?? '')
    setSelectedHour(parsed?.hour12 ?? null)
    setSelectedMinute(parsed?.minute ?? null)
    setSelectedMeridiem(parsed?.meridiem ?? null)
  }, [value])

  const availableMinutes = useMemo(
    () =>
      selectedDateValue
        ? getAvailableMinutes(selectedDateValue, selectedHour, selectedMeridiem)
        : [],
    [selectedDateValue, selectedHour, selectedMeridiem],
  )

  const selectionLabel = useMemo(() => {
    if (
      !selectedDateValue ||
      selectedHour === null ||
      selectedMinute === null ||
      selectedMeridiem === null
    ) {
      return placeholder
    }

    return `${formatRescheduleDateLabel(selectedDateValue)} at ${formatRescheduleTimeLabel(
      selectedHour,
      selectedMinute,
      selectedMeridiem,
    )}`
  }, [placeholder, selectedDateValue, selectedHour, selectedMinute, selectedMeridiem])

  const validationMessage = useMemo(() => {
    if (!selectedDateValue) {
      return 'Select a future date and time.'
    }

    const nextValidSelection = getFirstAvailableRescheduleTime(selectedDateValue)

    if (!nextValidSelection) {
      return 'No future times are available for the selected date.'
    }

    if (
      selectedHour === null ||
      selectedMinute === null ||
      selectedMeridiem === null
    ) {
      return 'Select a future time for the chosen date.'
    }

    return isFutureRescheduleSelection(
      selectedDateValue,
      selectedHour,
      selectedMinute,
      selectedMeridiem,
    )
      ? null
      : 'Proposed date and time must be in the future.'
  }, [selectedDateValue, selectedHour, selectedMinute, selectedMeridiem])

  useEffect(() => {
    onValidationChange?.(validationMessage)

    if (
      selectedDateValue &&
      selectedHour !== null &&
      selectedMinute !== null &&
      selectedMeridiem !== null
    ) {
      const nextValue = buildReschedulePayloadValue(
        selectedDateValue,
        selectedHour,
        selectedMinute,
        selectedMeridiem,
      )

      if (nextValue) {
        onValueChange(nextValue)
      }
    }
  }, [
    onValidationChange,
    onValueChange,
    selectedDateValue,
    selectedHour,
    selectedMinute,
    selectedMeridiem,
    validationMessage,
  ])

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) {
      return
    }

    const dateValue = formatDateInputValue(date)
    const nextValidSelection = getFirstAvailableRescheduleTime(dateValue)

    setSelectedDateValue(dateValue)

    if (!nextValidSelection) {
      setSelectedHour(null)
      setSelectedMinute(null)
      setSelectedMeridiem(null)
      return
    }

    const hasValidCurrentSelection =
      selectedHour !== null &&
      selectedMinute !== null &&
      selectedMeridiem !== null &&
      isFutureRescheduleSelection(
        dateValue,
        selectedHour,
        selectedMinute,
        selectedMeridiem,
      )

    if (hasValidCurrentSelection) {
      return
    }

    setSelectedHour(nextValidSelection.hour12)
    setSelectedMinute(nextValidSelection.minute)
    setSelectedMeridiem(nextValidSelection.meridiem)
  }

  const handleSelectHour = (hour12: number) => {
    setSelectedHour(hour12)

    if (!selectedDateValue || !selectedMeridiem) {
      return
    }

    const nextMinutes = getAvailableMinutes(selectedDateValue, hour12, selectedMeridiem)

    if (
      nextMinutes.length > 0 &&
      (!selectedMinute || !nextMinutes.includes(selectedMinute))
    ) {
      setSelectedMinute(nextMinutes[0])
    }
  }

  const handleSelectMinute = (minute: RescheduleMinute) => {
    setSelectedMinute(minute)
  }

  const handleSelectMeridiem = (meridiem: RescheduleMeridiem) => {
    setSelectedMeridiem(meridiem)

    if (!selectedDateValue || selectedHour === null) {
      return
    }

    const nextMinutes = getAvailableMinutes(selectedDateValue, selectedHour, meridiem)

    if (
      nextMinutes.length > 0 &&
      (!selectedMinute || !nextMinutes.includes(selectedMinute))
    ) {
      setSelectedMinute(nextMinutes[0])
    }
  }

  return (
    <div className="space-y-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between px-3 text-left font-normal"
          >
            <span>{selectionLabel}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,42rem)] p-0" align="start">
          <div className="flex flex-col md:flex-row">
            <Calendar
              mode="single"
              selected={parseDateInputValue(selectedDateValue) ?? undefined}
              defaultMonth={parseDateInputValue(selectedDateValue) ?? undefined}
              onSelect={handleSelectDate}
              disabled={(date) => disabled || formatDateInputValue(date) < todayDateValue}
              className="border-b md:border-r"
            />
            <div className="grid flex-1 grid-cols-[1fr_1fr_auto] divide-x">
              <div className="space-y-3 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Hour
                </p>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
                  {RESCHEDULE_HOUR_OPTIONS.map((hour12) => (
                    <Button
                      key={hour12}
                      type="button"
                      variant="outline"
                      aria-label={`Hour ${hour12}`}
                      disabled={disabled}
                      className={cn(
                        'justify-center',
                        selectedHour === hour12 &&
                          'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
                      )}
                      onClick={() => handleSelectHour(hour12)}
                    >
                      {hour12}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Minute
                </p>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
                  {RESCHEDULE_MINUTE_OPTIONS.map((minute) => {
                    const isDisabled =
                      disabled ||
                      !selectedDateValue ||
                      selectedHour === null ||
                      selectedMeridiem === null ||
                      !availableMinutes.includes(minute)

                    return (
                      <Button
                        key={minute}
                        type="button"
                        variant="outline"
                        aria-label={`Minute ${minute}`}
                        disabled={isDisabled}
                        className={cn(
                          'justify-center',
                          selectedMinute === minute &&
                            !isDisabled &&
                            'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
                        )}
                        onClick={() => handleSelectMinute(minute)}
                      >
                        {minute}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Period
                </p>
                <div className="flex flex-col gap-2">
                  {(['AM', 'PM'] as const).map((meridiem) => (
                    <Button
                      key={meridiem}
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      className={cn(
                        'justify-center',
                        selectedMeridiem === meridiem &&
                          'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
                      )}
                      onClick={() => handleSelectMeridiem(meridiem)}
                    >
                      {meridiem}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {validationMessage ? (
        <p className="text-sm text-destructive">{validationMessage}</p>
      ) : null}
    </div>
  )
}
