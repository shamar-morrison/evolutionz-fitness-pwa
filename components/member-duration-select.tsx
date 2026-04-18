'use client'

import {
  MEMBER_DURATION_OPTIONS,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type MemberDurationSelectProps = {
  id?: string
  value: MemberDurationValue | ''
  onValueChange: (value: MemberDurationValue) => void
  disabled?: boolean
  placeholder?: string
  allowedDurations?: readonly MemberDurationValue[]
}

export function MemberDurationSelect({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select duration',
  allowedDurations,
}: MemberDurationSelectProps) {
  const visibleOptions = allowedDurations
    ? MEMBER_DURATION_OPTIONS.filter((option) => allowedDurations.includes(option.value))
    : MEMBER_DURATION_OPTIONS

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as MemberDurationValue)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className='min-w-full'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {visibleOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
