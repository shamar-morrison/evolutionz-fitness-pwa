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
}

export function MemberDurationSelect({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select duration',
}: MemberDurationSelectProps) {
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
        {MEMBER_DURATION_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
