import { JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import {
  getMemberDurationDays,
  getMemberDurationLabelFromDays,
  type MemberDurationValue,
} from '@/lib/member-access-time'
import { resolveMembershipLifecycleStatus } from '@/lib/member-status'
import type { MemberStatus } from '@/types'

export const MEMBER_EXTENSION_INACTIVE_ERROR = 'Member has no active membership.'

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

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

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatUtcDateTimeValue(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

export function getMemberExtensionDurationDays(value: MemberDurationValue) {
  return getMemberDurationDays(value)
}

export function isSupportedMemberExtensionDurationDays(days: number) {
  return getMemberDurationLabelFromDays(days) !== null
}

export function getMemberExtensionDurationLabel(days: number) {
  return getMemberDurationLabelFromDays(days)
}

export function formatMemberExtensionDuration(days: number) {
  const label = getMemberExtensionDurationLabel(days)

  return label ? `${label} (${days} day${days === 1 ? '' : 's'})` : `${days} days`
}

export function isMemberExtensionEligible(
  endTime: string | null | undefined,
  status: MemberStatus,
  now: Date = new Date(),
) {
  if (status === 'Suspended' || status === 'Paused') {
    return false
  }

  if (!endTime) {
    return false
  }

  return resolveMembershipLifecycleStatus(endTime, now) === 'Active'
}

export function calculateProjectedMemberEndTime(
  endTime: string | null | undefined,
  durationDays: number,
) {
  const timestamp = getTimestamp(endTime)

  if (timestamp === null) {
    return null
  }

  return new Date(timestamp + durationDays * 24 * 60 * 60 * 1000)
}

export function buildExtendedMemberEndTimeValue(
  endTime: string | null | undefined,
  durationDays: number,
) {
  const projectedEndTime = calculateProjectedMemberEndTime(endTime, durationDays)

  return projectedEndTime ? formatUtcDateTimeValue(projectedEndTime) : null
}

export function formatMemberExtensionDate(
  value: string | Date | null | undefined,
  month: 'short' | 'long' = 'long',
) {
  if (!value) {
    return 'Not set'
  }

  const date =
    value instanceof Date
      ? value
      : (() => {
          const normalizedValue = normalizeTimestamp(value)
          return normalizedValue ? new Date(normalizedValue) : null
        })()

  if (!date || Number.isNaN(date.getTime())) {
    return 'Not set'
  }

  return date.toLocaleDateString('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month,
    day: 'numeric',
  })
}
