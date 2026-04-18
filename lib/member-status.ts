import type { MemberStatus } from '@/types'

type MembershipLifecycleStatus = Extract<MemberStatus, 'Active' | 'Expired'>

function normalizeMemberStatusDateTime(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return null
  }

  // Supabase stores these as timestamptz and the app sends naive timestamps.
  // Treat naive values as UTC so route-side comparisons match persisted values.
  return /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(normalizedValue)
    ? normalizedValue
    : `${normalizedValue}Z`
}

function getMemberStatusTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeMemberStatusDateTime(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = Date.parse(normalizedValue)

  return Number.isNaN(timestamp) ? null : timestamp
}

export function resolveMembershipLifecycleStatus(
  endTime: string | null | undefined,
  now: Date = new Date(),
): MembershipLifecycleStatus {
  const endTimeTimestamp = getMemberStatusTimestamp(endTime)

  if (endTimeTimestamp === null) {
    return 'Active'
  }

  return endTimeTimestamp < now.getTime() ? 'Expired' : 'Active'
}

export function resolveMemberStatusForAccessWindowUpdate({
  currentStatus,
  endTime,
  now = new Date(),
}: {
  currentStatus: MemberStatus
  endTime: string | null | undefined
  now?: Date
}): MemberStatus {
  if (currentStatus === 'Suspended' || currentStatus === 'Paused') {
    return currentStatus
  }

  return resolveMembershipLifecycleStatus(endTime, now)
}
