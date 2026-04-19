import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import {
  getJamaicaDateValue,
  getMonthDateValues,
  getMonthRange,
  getMonthValueInJamaica,
  parseMonthValue,
} from '@/lib/pt-scheduling'
import type { DashboardMembershipStats } from '@/types'

export type DashboardStatsLegacyMemberRow = {
  id: string
  status: 'Active' | 'Expired' | 'Suspended' | 'Paused'
  begin_time: string | null
  end_time: string | null
  joined_at: string | null
}

type DashboardMonthWindow = {
  month: string
  startDate: string
  endDate: string
  startInclusive: string
  endExclusive: string
}

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

function shiftMonthValue(monthValue: string, offset: number) {
  const parts = parseMonthValue(monthValue)

  if (!parts) {
    throw new Error('Failed to resolve the dashboard month window.')
  }

  let nextMonth = parts.month + offset
  let nextYear = parts.year

  while (nextMonth < 1) {
    nextMonth += 12
    nextYear -= 1
  }

  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

function getMonthWindow(monthValue: string): DashboardMonthWindow {
  const parts = parseMonthValue(monthValue)

  if (!parts) {
    throw new Error('Failed to resolve the dashboard month window.')
  }

  const bounds = getMonthRange(parts.month, parts.year)
  const dateValues = getMonthDateValues(parts.month, parts.year)
  const startDate = dateValues[0]
  const endDate = dateValues[dateValues.length - 1]

  if (!bounds || !startDate || !endDate) {
    throw new Error('Failed to resolve the dashboard month window.')
  }

  return {
    month: monthValue,
    startDate,
    endDate,
    startInclusive: bounds.startInclusive,
    endExclusive: bounds.endExclusive,
  }
}

function getTrailingMonthWindows(now: Date, totalMonths: number) {
  const currentMonthValue = getMonthValueInJamaica(now)

  return Array.from({ length: totalMonths }, (_, index) =>
    getMonthWindow(shiftMonthValue(currentMonthValue, index - (totalMonths - 1))),
  )
}

export function calculateLegacyDashboardStats(
  members: DashboardStatsLegacyMemberRow[],
  now: Date,
): DashboardMembershipStats {
  const { startInclusive, endExclusive } = getJamaicaExpiringWindow(now)
  const monthWindows = getTrailingMonthWindows(now, 6)
  const currentMonth = monthWindows[monthWindows.length - 1]
  const previousMonth = monthWindows[monthWindows.length - 2]

  if (!currentMonth || !previousMonth) {
    throw new Error('Failed to resolve the dashboard month windows.')
  }

  const activeMembers = members.filter((member) => member.status === 'Active').length
  const totalExpiredMembers = members.filter((member) => member.status === 'Expired').length
  const expiringSoon = members.filter((member) => {
    if (member.status !== 'Active' || !member.end_time) {
      return false
    }

    const timestamp = Date.parse(member.end_time)
    const startMs = Date.parse(startInclusive)
    const endMs = Date.parse(endExclusive)

    return !Number.isNaN(timestamp) && timestamp >= startMs && timestamp < endMs
  }).length

  const previousMonthStartTimestamp = Date.parse(previousMonth.startInclusive)

  if (Number.isNaN(previousMonthStartTimestamp)) {
    throw new Error('Failed to resolve the previous dashboard month boundary.')
  }

  const activeMembersLastMonth = members.reduce((count, member) => {
    if (!member.begin_time || member.begin_time >= currentMonth.startInclusive) {
      return count
    }

    const endTimeTimestamp = getTimestamp(member.end_time)

    if (endTimeTimestamp === null || endTimeTimestamp > previousMonthStartTimestamp) {
      return count + 1
    }

    return count
  }, 0)

  const signupCounts = new Map(monthWindows.map(({ month }) => [month, 0]))

  for (const member of members) {
    const month = typeof member.joined_at === 'string' ? member.joined_at.slice(0, 7) : ''

    if (!signupCounts.has(month)) {
      continue
    }

    signupCounts.set(month, (signupCounts.get(month) ?? 0) + 1)
  }

  const signupsByMonth = monthWindows.map(({ month }) => ({
    month,
    count: signupCounts.get(month) ?? 0,
  }))

  let expiredThisMonth = 0
  let expiredThisMonthLastMonth = 0

  for (const member of members) {
    const month = member.end_time ? getJamaicaDateValue(member.end_time)?.slice(0, 7) ?? '' : ''

    if (month === currentMonth.month) {
      expiredThisMonth += 1
      continue
    }

    if (month === previousMonth.month) {
      expiredThisMonthLastMonth += 1
    }
  }

  return {
    activeMembers,
    activeMembersLastMonth,
    totalExpiredMembers,
    expiringSoon,
    signedUpThisMonth: signupsByMonth[signupsByMonth.length - 1]?.count ?? 0,
    signupsByMonth,
    expiredThisMonth,
    expiredThisMonthLastMonth,
  }
}
