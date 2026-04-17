import { NextResponse } from 'next/server'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import {
  getJamaicaDateValue,
  getMonthDateValues,
  getMonthRange,
  getMonthValueInJamaica,
  parseMonthValue,
} from '@/lib/pt-scheduling'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type DashboardStatsClient = ReturnType<typeof getSupabaseAdminClient>

type DashboardMonthWindow = {
  month: string
  startDate: string
  endDate: string
  startInclusive: string
  endExclusive: string
}

type SignupRow = {
  joined_at: string | null
}

type ExpiryRow = {
  end_time: string | null
}

type ActiveOverlapRow = {
  id: string
  end_time: string | null
}

type RevenueRow = {
  amount_paid: number | string
  payment_date: string
  payment_type: 'membership' | 'card_fee'
}

function normalizeAmount(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return null
  }

  return /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(normalizedValue)
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

async function countMembersByStatus(
  supabase: DashboardStatsClient,
  status: 'Active' | 'Expired',
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)

  if (error) {
    throw new Error(`Failed to read ${status.toLowerCase()} member count: ${error.message}`)
  }

  return count ?? 0
}

async function countExpiringSoon(
  supabase: DashboardStatsClient,
  startInclusive: string,
  endExclusive: string,
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Active')
    .gte('end_time', startInclusive)
    .lt('end_time', endExclusive)

  if (error) {
    throw new Error(`Failed to read expiring-soon member count: ${error.message}`)
  }

  return count ?? 0
}

async function readSignupsByMonth(
  supabase: DashboardStatsClient,
  monthWindows: DashboardMonthWindow[],
) {
  const firstMonth = monthWindows[0]
  const lastMonth = monthWindows[monthWindows.length - 1]

  if (!firstMonth || !lastMonth) {
    throw new Error('Failed to resolve the dashboard signup range.')
  }

  const { data, error } = await supabase
    .from('members')
    .select('joined_at')
    .not('joined_at', 'is', null)
    .gte('joined_at', firstMonth.startDate)
    .lte('joined_at', lastMonth.endDate)

  if (error) {
    throw new Error(`Failed to read signup counts for the dashboard: ${error.message}`)
  }

  const counts = new Map(monthWindows.map(({ month }) => [month, 0]))

  for (const row of (data ?? []) as SignupRow[]) {
    const month = typeof row.joined_at === 'string' ? row.joined_at.slice(0, 7) : ''

    if (!counts.has(month)) {
      continue
    }

    counts.set(month, (counts.get(month) ?? 0) + 1)
  }

  return monthWindows.map(({ month }) => ({
    month,
    count: counts.get(month) ?? 0,
  }))
}

async function readExpiryCounts(
  supabase: DashboardStatsClient,
  previousMonth: DashboardMonthWindow,
  currentMonth: DashboardMonthWindow,
) {
  const { data, error } = await supabase
    .from('members')
    .select('end_time')
    .gte('end_time', previousMonth.startInclusive)
    .lt('end_time', currentMonth.endExclusive)

  if (error) {
    throw new Error(`Failed to read expiry counts for the dashboard: ${error.message}`)
  }

  let expiredThisMonth = 0
  let expiredThisMonthLastMonth = 0

  for (const row of (data ?? []) as ExpiryRow[]) {
    const month = row.end_time ? getJamaicaDateValue(row.end_time)?.slice(0, 7) ?? '' : ''

    if (month === currentMonth.month) {
      expiredThisMonth += 1
      continue
    }

    if (month === previousMonth.month) {
      expiredThisMonthLastMonth += 1
    }
  }

  return {
    expiredThisMonth,
    expiredThisMonthLastMonth,
  }
}

async function readActiveMembersLastMonth(
  supabase: DashboardStatsClient,
  previousMonth: DashboardMonthWindow,
  currentMonth: DashboardMonthWindow,
) {
  const { data, error } = await supabase
    .from('members')
    .select('id, end_time')
    .not('begin_time', 'is', null)
    .lt('begin_time', currentMonth.startInclusive)

  if (error) {
    throw new Error(`Failed to read last-month active members: ${error.message}`)
  }

  const previousMonthStartTimestamp = Date.parse(previousMonth.startInclusive)

  if (Number.isNaN(previousMonthStartTimestamp)) {
    throw new Error('Failed to resolve the previous dashboard month boundary.')
  }

  return ((data ?? []) as ActiveOverlapRow[]).reduce((count, row) => {
    const endTimeTimestamp = getTimestamp(row.end_time)

    if (endTimeTimestamp === null || endTimeTimestamp > previousMonthStartTimestamp) {
      return count + 1
    }

    return count
  }, 0)
}

async function readRevenueTotals(
  supabase: DashboardStatsClient,
  previousMonth: DashboardMonthWindow,
  currentMonth: DashboardMonthWindow,
) {
  const { data, error } = await supabase
    .from('member_payments')
    .select('amount_paid, payment_date, payment_type')
    .in('payment_type', ['membership', 'card_fee'])
    .gte('payment_date', previousMonth.startDate)
    .lte('payment_date', currentMonth.endDate)

  if (error) {
    throw new Error(`Failed to read dashboard revenue totals: ${error.message}`)
  }

  let totalRevenueThisMonth = 0
  let totalRevenueLastMonth = 0
  let membershipRevenueThisMonth = 0
  let cardFeeRevenueThisMonth = 0

  for (const row of (data ?? []) as RevenueRow[]) {
    const month = typeof row.payment_date === 'string' ? row.payment_date.slice(0, 7) : ''
    const amount = normalizeAmount(row.amount_paid)

    if (month === currentMonth.month) {
      totalRevenueThisMonth += amount

      if (row.payment_type === 'membership') {
        membershipRevenueThisMonth += amount
      }

      if (row.payment_type === 'card_fee') {
        cardFeeRevenueThisMonth += amount
      }

      continue
    }

    if (month === previousMonth.month) {
      totalRevenueLastMonth += amount
    }
  }

  return {
    membershipRevenueThisMonth,
    cardFeeRevenueThisMonth,
    totalRevenueThisMonth,
    totalRevenueLastMonth,
  }
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const now = new Date()
    const supabase = getSupabaseAdminClient()
    const { startInclusive, endExclusive } = getJamaicaExpiringWindow(now)
    const monthWindows = getTrailingMonthWindows(now, 6)
    const currentMonth = monthWindows[monthWindows.length - 1]
    const previousMonth = monthWindows[monthWindows.length - 2]

    if (!currentMonth || !previousMonth) {
      throw new Error('Failed to resolve the dashboard month windows.')
    }

    const [
      activeMembers,
      totalExpiredMembers,
      expiringSoon,
      activeMembersLastMonth,
      signupsByMonth,
      expiryCounts,
      revenueTotals,
    ] = await Promise.all([
      countMembersByStatus(supabase, 'Active'),
      countMembersByStatus(supabase, 'Expired'),
      countExpiringSoon(supabase, startInclusive, endExclusive),
      readActiveMembersLastMonth(supabase, previousMonth, currentMonth),
      readSignupsByMonth(supabase, monthWindows),
      readExpiryCounts(supabase, previousMonth, currentMonth),
      readRevenueTotals(supabase, previousMonth, currentMonth),
    ])

    return NextResponse.json({
      activeMembers,
      activeMembersLastMonth,
      totalExpiredMembers,
      expiringSoon,
      signedUpThisMonth: signupsByMonth[signupsByMonth.length - 1]?.count ?? 0,
      signupsByMonth,
      expiredThisMonth: expiryCounts.expiredThisMonth,
      expiredThisMonthLastMonth: expiryCounts.expiredThisMonthLastMonth,
      membershipRevenueThisMonth: revenueTotals.membershipRevenueThisMonth,
      cardFeeRevenueThisMonth: revenueTotals.cardFeeRevenueThisMonth,
      totalRevenueThisMonth: revenueTotals.totalRevenueThisMonth,
      totalRevenueLastMonth: revenueTotals.totalRevenueLastMonth,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while loading dashboard stats.',
      },
      { status: 500 },
    )
  }
}
