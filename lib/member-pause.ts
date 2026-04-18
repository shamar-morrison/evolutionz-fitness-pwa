import { addDays } from 'date-fns'
import {
  formatDateInputValue,
  getJamaicaDateInputValue,
  getMemberDurationLabelFromDays,
  getMemberDurationValueFromDays,
  parseDateInputValue,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import type { MemberStatus } from '@/types'

export const MEMBER_PAUSE_INACTIVE_ERROR = 'Member has no active membership.'
export const MEMBER_PAUSE_ACTIVE_ERROR = 'Member already has an active pause.'
export const MEMBER_PAUSE_REQUEST_PENDING_ERROR =
  'A membership pause request is already pending for this member.'
export const MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR =
  'An early resume request is already pending for this pause.'

export const MEMBER_PAUSE_ALLOWED_DURATIONS = [
  '1_week',
  '2_weeks',
  '1_month',
  '2_months',
  '3_months',
  '4_months',
  '5_months',
  '6_months',
  '9_months',
  '12_months',
] as const satisfies readonly MemberDurationValue[]

const MEMBER_PAUSE_ALLOWED_DURATION_SET = new Set<number>(
  MEMBER_PAUSE_ALLOWED_DURATIONS.map((value) => {
    const daysByValue: Record<(typeof MEMBER_PAUSE_ALLOWED_DURATIONS)[number], number> = {
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
    }

    return daysByValue[value]
  }),
)

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  return /(?:[zZ]|[+-]\d{2}:\d{2})$/u.test(normalizedValue)
    ? normalizedValue
    : `${normalizedValue}Z`
}

function getTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeTimestamp(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = Date.parse(normalizedValue)

  return Number.isNaN(timestamp) ? null : timestamp
}

function getJamaicaDateTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = new Map<string, string>()

  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'literal') {
      continue
    }

    parts.set(part.type, part.value)
  }

  const year = parts.get('year')
  const month = parts.get('month')
  const day = parts.get('day')
  const hour = parts.get('hour')
  const minute = parts.get('minute')
  const second = parts.get('second')

  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error('Failed to resolve the current Jamaica-local timestamp.')
  }

  return {
    dateValue: `${year}-${month}-${day}`,
    timeValue: `${hour}:${minute}:${second}`,
    timestampWithOffset: `${year}-${month}-${day}T${hour}:${minute}:${second}${JAMAICA_OFFSET}`,
  }
}

export function getMemberPauseJamaicaNow(now = new Date()) {
  return getJamaicaDateTimeParts(now)
}

export function isSupportedMemberPauseDurationDays(days: number) {
  return MEMBER_PAUSE_ALLOWED_DURATION_SET.has(days)
}

export function getMemberPauseDurationLabel(days: number) {
  const label = getMemberDurationLabelFromDays(days)
  return label ? `${label} (${days} day${days === 1 ? '' : 's'})` : `${days} days`
}

export function getMemberPauseDurationValue(days: number) {
  const value = getMemberDurationValueFromDays(days)

  if (!value) {
    return null
  }

  return MEMBER_PAUSE_ALLOWED_DURATIONS.some((allowedValue) => allowedValue === value) ? value : null
}

export function calculateProjectedPausedMemberEndTime(
  endTime: string | null | undefined,
  durationDays: number,
) {
  const timestamp = getTimestamp(endTime)

  if (timestamp === null) {
    return null
  }

  return new Date(timestamp + durationDays * 24 * 60 * 60 * 1000)
}

export function calculatePlannedPauseResumeDate(
  durationDays: number,
  todayDateValue = getJamaicaDateInputValue(new Date()),
) {
  const today = parseDateInputValue(todayDateValue)

  if (!today) {
    return null
  }

  return formatDateInputValue(addDays(today, durationDays))
}

export function isMemberPauseEligible(
  endTime: string | null | undefined,
  status: MemberStatus,
  now = new Date(),
) {
  if (status !== 'Active') {
    return false
  }

  const endTimeTimestamp = getTimestamp(endTime)

  if (endTimeTimestamp === null) {
    return false
  }

  return endTimeTimestamp >= now.getTime()
}
