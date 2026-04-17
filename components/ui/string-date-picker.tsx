'use client'

import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  formatDateInputDisplay,
  formatDateInputValue,
  parseDateInputValue,
} from '@/lib/member-access-time'

type StringDatePickerProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minValue?: string
  maxValue?: string
  allowClear?: boolean
}

export function StringDatePicker({
  id,
  value,
  onChange,
  placeholder = 'Select a date',
  disabled = false,
  minValue,
  maxValue,
  allowClear = false,
}: StringDatePickerProps) {
  const [open, setOpen] = useState(false)
  const selectedDate = useMemo(() => parseDateInputValue(value) ?? undefined, [value])
  const defaultMonth = useMemo(
    () => selectedDate ?? parseDateInputValue(minValue ?? maxValue ?? '') ?? undefined,
    [maxValue, minValue, selectedDate],
  )
  const displayValue = useMemo(() => formatDateInputDisplay(value, placeholder), [placeholder, value])

  return (
    <div className="flex w-full items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="flex-1 justify-between px-3 text-left font-normal"
          >
            <span>{displayValue}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            data-testid={`${id}-calendar`}
            mode="single"
            selected={selectedDate}
            defaultMonth={defaultMonth}
            onSelect={(date) => {
              if (!date) {
                return
              }

              onChange(formatDateInputValue(date))
              setOpen(false)
            }}
            disabled={(date) => {
              const dateValue = formatDateInputValue(date)

              if (minValue && dateValue < minValue) {
                return true
              }

              if (maxValue && dateValue > maxValue) {
                return true
              }

              return false
            }}
          />
        </PopoverContent>
      </Popover>

      {allowClear && value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          data-testid={`${id}-clear`}
          aria-label="Clear selected date"
          onClick={() => {
            onChange('')
            setOpen(false)
          }}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}
