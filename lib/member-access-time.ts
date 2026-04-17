import { addDays, format, subDays } from 'date-fns'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'

export type MemberDurationValue =
  | '1_day'
  | '1_week'
  | '2_weeks'
  | '1_month'
  | '2_months'
  | '3_months'
  | '4_months'
  | '5_months'
  | '6_months'
  | '9_months'
  | '12_months'
  | '13_months'

export const MEMBER_DURATION_LABELS = {
  '1_day': '1 Day',
  '1_week': '1 Week',
  '2_weeks': '2 Weeks',
  '1_month': '1 Month',
  '2_months': '2 Months',
  '3_months': '3 Months',
  '4_months': '4 Months',
  '5_months': '5 Months',
  '6_months': '6 Months',
  '9_months': '9 Months',
  '12_months': '12 Months',
  '13_months': '13 Months / 1 Year',
} as const satisfies Record<MemberDurationValue, string>

export type MemberDurationLabel = (typeof MEMBER_DURATION_LABELS)[MemberDurationValue]

export const MEMBER_DURATION_LABEL_VALUES = Object.values(MEMBER_DURATION_LABELS) as [
  MemberDurationLabel,
  ...MemberDurationLabel[],
]

export const MEMBER_DURATION_OPTIONS: Array<{
  value: MemberDurationValue
  label: MemberDurationLabel
}> = [
  { value: '1_day', label: MEMBER_DURATION_LABELS['1_day'] },
  { value: '1_week', label: MEMBER_DURATION_LABELS['1_week'] },
  { value: '2_weeks', label: MEMBER_DURATION_LABELS['2_weeks'] },
  { value: '1_month', label: MEMBER_DURATION_LABELS['1_month'] },
  { value: '2_months', label: MEMBER_DURATION_LABELS['2_months'] },
  { value: '3_months', label: MEMBER_DURATION_LABELS['3_months'] },
  { value: '4_months', label: MEMBER_DURATION_LABELS['4_months'] },
  { value: '5_months', label: MEMBER_DURATION_LABELS['5_months'] },
  { value: '6_months', label: MEMBER_DURATION_LABELS['6_months'] },
  { value: '9_months', label: MEMBER_DURATION_LABELS['9_months'] },
  { value: '12_months', label: MEMBER_DURATION_LABELS['12_months'] },
  { value: '13_months', label: MEMBER_DURATION_LABELS['13_months'] },
]

const MEMBER_DURATION_DAYS: Record<MemberDurationValue, number> = {
  '1_day': 1,
  '1_week': 7,
  '2_weeks': 14,
  '1_month': 28,
  '2_months': 56,
  '3_months': 84,
  '4_months': 112,
  '5_months': 140,
  '6_months': 168,
  '9_months': 252,
  '12_months': 336,
  '13_months': 364,
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2}))?$/
const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = new Map<string, string>()

  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'literal') {
      continue
    }

    parts.set(part.type, part.value)
  }

  return parts
}

export function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getJamaicaDateInputValue(date: Date) {
  const parts = getDatePartsInTimeZone(date, JAMAICA_TIME_ZONE)
  const year = parts.get('year')
  const month = parts.get('month')
  const day = parts.get('day')

  if (!year || !month || !day) {
    throw new Error('Failed to format a Jamaica-local calendar date.')
  }

  return `${year}-${month}-${day}`
}

export function getJamaicaExpiringWindow(now: Date) {
  const startDateValue = getJamaicaDateInputValue(now)
  const startDate = parseDateInputValue(startDateValue)

  if (!startDate) {
    throw new Error('Failed to build the Jamaica expiring-members window start date.')
  }

  const endExclusiveDateValue = formatDateInputValue(addDays(startDate, 8))

  return {
    startInclusive: `${startDateValue}T00:00:00${JAMAICA_OFFSET}`,
    endExclusive: `${endExclusiveDateValue}T00:00:00${JAMAICA_OFFSET}`,
  }
}

export function isWithinTimeWindow(
  value: string | null | undefined,
  window: { startInclusive: string; endExclusive: string },
) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return false
  }

  const timestampMs = Date.parse(normalizedValue)
  const startMs = Date.parse(window.startInclusive)
  const endMs = Date.parse(window.endExclusive)

  if (Number.isNaN(timestampMs) || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return false
  }

  return timestampMs >= startMs && timestampMs < endMs
}

export function isWithinJamaicaExpiringWindow(
  value: string | null | undefined,
  now: Date,
) {
  return isWithinTimeWindow(value, getJamaicaExpiringWindow(now))
}

export function getJamaicaDayWindow(now: Date, daysFromToday = 0) {
  const todayDateValue = getJamaicaDateInputValue(now)
  const todayDate = parseDateInputValue(todayDateValue)

  if (!todayDate) {
    throw new Error('Failed to build the Jamaica calendar day window start date.')
  }

  const targetDate = addDays(todayDate, daysFromToday)
  const targetDateValue = formatDateInputValue(targetDate)
  const endExclusiveDateValue = formatDateInputValue(addDays(targetDate, 1))

  return {
    targetDateValue,
    startInclusive: `${targetDateValue}T00:00:00${JAMAICA_OFFSET}`,
    endExclusive: `${endExclusiveDateValue}T00:00:00${JAMAICA_OFFSET}`,
  }
}

export function normalizeTimeInputValue(value: string) {
  const match = timePattern.exec(value.trim())

  if (!match) {
    return null
  }

  const [, hoursPart, minutesPart, secondsPart = '00'] = match
  const hours = Number(hoursPart)
  const minutes = Number(minutesPart)
  const seconds = Number(secondsPart)

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null
  }

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function getMemberDurationLabel(
  value: MemberDurationValue | '' | null | undefined,
): MemberDurationLabel | null {
  if (!value) {
    return null
  }

  return MEMBER_DURATION_LABELS[value]
}

export function getMemberDurationDays(value: MemberDurationValue) {
  return MEMBER_DURATION_DAYS[value]
}

export function getMemberDurationValueFromLabel(
  label: string | null | undefined,
): MemberDurationValue | null {
  const normalizedLabel = normalizeText(label)

  if (!normalizedLabel) {
    return null
  }

  for (const option of MEMBER_DURATION_OPTIONS) {
    if (option.label === normalizedLabel) {
      return option.value
    }
  }

  return null
}

export function getMemberDurationValueFromDays(days: number) {
  for (const option of MEMBER_DURATION_OPTIONS) {
    if (getMemberDurationDays(option.value) === days) {
      return option.value
    }
  }

  return null
}

export function getMemberDurationLabelFromDays(days: number) {
  const value = getMemberDurationValueFromDays(days)

  return value ? getMemberDurationLabel(value) : null
}

export function parseDateInputValue(value: string) {
  const match = datePattern.exec(value.trim())

  if (!match) {
    return null
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function formatDateInputDisplay(
  value: string | null | undefined,
  emptyLabel = 'Not set',
) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return emptyLabel
  }

  const parsedDate = parseDateInputValue(normalizedValue)

  if (!parsedDate) {
    return emptyLabel
  }

  return format(parsedDate, 'MMM d, yyyy')
}

export function parseLocalDateTime(value: string) {
  const match = dateTimePattern.exec(value.trim())

  if (!match) {
    return null
  }

  const [, yearPart, monthPart, dayPart, hoursPart, minutesPart, secondsPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const hours = Number(hoursPart)
  const minutes = Number(minutesPart)
  const seconds = Number(secondsPart)
  const date = new Date(year, monthIndex, day, hours, minutes, seconds, 0)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes ||
    date.getSeconds() !== seconds
  ) {
    return null
  }

  return date
}

export function calculateInclusiveEndDate(
  startDateValue: string,
  duration: MemberDurationValue,
) {
  const startDate = parseDateInputValue(startDateValue)

  if (!startDate) {
    return null
  }

  const exclusiveEndDate = addDays(startDate, getMemberDurationDays(duration))
  const inclusiveEndDate = subDays(exclusiveEndDate, 1)

  return formatDateInputValue(inclusiveEndDate)
}

export function buildBeginTimeValue(startDateValue: string, startTimeValue: string) {
  if (!parseDateInputValue(startDateValue)) {
    return null
  }

  const normalizedTime = normalizeTimeInputValue(startTimeValue)

  if (!normalizedTime) {
    return null
  }

  return `${startDateValue}T${normalizedTime}`
}

export function buildEndTimeValue(endDateValue: string) {
  if (!parseDateInputValue(endDateValue)) {
    return null
  }

  return `${endDateValue}T23:59:59`
}

export function getAccessDateTimeValue(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value.trim())

  if (!match) {
    return null
  }

  return `${match[1]}T${match[2]}`
}

export function getAccessDateInputValue(value: string | null | undefined) {
  return getAccessDateTimeValue(value)?.slice(0, 10) ?? ''
}

export function getAccessTimeInputValue(value: string | null | undefined) {
  return getAccessDateTimeValue(value)?.slice(11) ?? ''
}

export function findMatchingMemberDuration(
  beginTime: string | null | undefined,
  endTime: string | null | undefined,
): MemberDurationValue | null {
  const startDateValue = getAccessDateInputValue(beginTime)
  const normalizedEndTime = getAccessDateTimeValue(endTime)

  if (!startDateValue || !normalizedEndTime) {
    return null
  }

  for (const option of MEMBER_DURATION_OPTIONS) {
    const inclusiveEndDate = calculateInclusiveEndDate(startDateValue, option.value)
    const expectedEndTime = inclusiveEndDate ? buildEndTimeValue(inclusiveEndDate) : null

    if (expectedEndTime === normalizedEndTime) {
      return option.value
    }
  }

  return null
}

export function formatAccessDate(
  value: string | null,
  month: 'short' | 'long' = 'short',
) {
  if (!value) {
    return 'Not set'
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)

  if (!match) {
    return 'Not set'
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const date = new Date(Date.UTC(year, monthIndex, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return 'Not set'
  }

  return date.toLocaleDateString('en-JM', {
    timeZone: 'UTC',
    year: 'numeric',
    month,
    day: 'numeric',
  })
}
