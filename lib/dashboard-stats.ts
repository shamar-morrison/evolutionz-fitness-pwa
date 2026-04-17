import { z } from 'zod'
import type { DashboardMembershipStats } from '@/types'

const dashboardStatsSchema = z.object({
  activeMembers: z.number().int().nonnegative(),
  activeMembersLastMonth: z.number().int().nonnegative(),
  totalExpiredMembers: z.number().int().nonnegative(),
  expiringSoon: z.number().int().nonnegative(),
  signedUpThisMonth: z.number().int().nonnegative(),
  signupsByMonth: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/u),
      count: z.number().int().nonnegative(),
    }),
  ),
  expiredThisMonth: z.number().int().nonnegative(),
  expiredThisMonthLastMonth: z.number().int().nonnegative(),
  membershipRevenueThisMonth: z.number().finite().nonnegative(),
  cardFeeRevenueThisMonth: z.number().finite().nonnegative(),
  totalRevenueThisMonth: z.number().finite().nonnegative(),
  totalRevenueLastMonth: z.number().finite().nonnegative(),
})

type DashboardStatsErrorResponse = {
  error: string
}

export function normalizeDashboardStats(input: unknown): DashboardMembershipStats {
  const parsed = dashboardStatsSchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Dashboard stats returned an unexpected response.')
  }

  return parsed.data
}

function getDashboardStatsError(responseBody: unknown) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return (responseBody as DashboardStatsErrorResponse).error
  }

  return null
}

export async function fetchDashboardStats(): Promise<DashboardMembershipStats> {
  const response = await fetch('/api/dashboard/stats', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: DashboardMembershipStats | DashboardStatsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | DashboardMembershipStats
      | DashboardStatsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    throw new Error(getDashboardStatsError(responseBody) ?? 'Failed to load dashboard stats.')
  }

  return normalizeDashboardStats(responseBody)
}
