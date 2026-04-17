import { z } from 'zod'
import {
  formatDateInputDisplay,
  getJamaicaDateInputValue,
  parseDateInputValue,
} from '@/lib/member-access-time'
import { getThisMonthRange, getThisWeekRange, getThisYearRange } from '@/lib/date-utils'
import { formatJmdCurrency } from '@/lib/pt-scheduling'

const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().trim().min(1),
})

const memberSignupReportRowSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  status: z.enum(['Active', 'Expired', 'Suspended']),
  joinedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const memberExpiredReportRowSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  status: z.enum(['Active', 'Expired', 'Suspended']),
  expiryDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const memberReportRevenueBreakdownItemSchema = z.object({
  label: z.string().trim().min(1),
  total: z.number().finite(),
  isEstimate: z.boolean(),
})

const memberReportRevenueBreakdownSchema = z.object({
  byType: z.array(memberReportRevenueBreakdownItemSchema).default([]),
  total: z.number().finite(),
  hasEstimates: z.boolean(),
})

const memberSignupsReportSchema = z.object({
  members: z.array(memberSignupReportRowSchema).default([]),
  revenueBreakdown: memberReportRevenueBreakdownSchema,
})

const memberExpiredReportSchema = z.object({
  members: z.array(memberExpiredReportRowSchema).default([]),
  revenueBreakdown: memberReportRevenueBreakdownSchema,
})

export type MemberReportPeriod = 'this-week' | 'this-month' | 'this-year' | 'custom'

export type MemberReportDateRange = {
  startDate: string
  endDate: string
}

export type MemberReportRevenueBreakdown = z.infer<typeof memberReportRevenueBreakdownSchema>
export type MemberSignupsReport = z.infer<typeof memberSignupsReportSchema>
export type MemberExpiredReport = z.infer<typeof memberExpiredReportSchema>

export const MEMBER_REPORT_PERIOD_OPTIONS: Array<{
  label: string
  value: MemberReportPeriod
}> = [
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'This Year', value: 'this-year' },
  { label: 'Custom Range', value: 'custom' },
]

function buildSearchParams(filters: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  return searchParams
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  const parsed = errorResponseSchema.safeParse(payload)

  return parsed.success ? parsed.data.error : fallback
}

export function isMemberReportPeriod(value: string): value is MemberReportPeriod {
  return MEMBER_REPORT_PERIOD_OPTIONS.some((option) => option.value === value)
}

export function getMemberReportDateRangeForPeriod(
  period: MemberReportPeriod,
  now = new Date(),
): MemberReportDateRange {
  switch (period) {
    case 'this-week':
      return getThisWeekRange(now)
    case 'this-month':
      return getThisMonthRange(now)
    case 'this-year':
      return getThisYearRange(now)
    case 'custom': {
      const today = getJamaicaDateInputValue(now)

      return {
        startDate: today,
        endDate: today,
      }
    }
    default:
      return getThisMonthRange(now)
  }
}

export function formatMemberReportDate(value: string) {
  return formatDateInputDisplay(value, value)
}

export function formatMemberReportGeneratedTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-JM', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function createEmptyMemberReportRevenueBreakdown(): MemberReportRevenueBreakdown {
  return {
    byType: [],
    total: 0,
    hasEstimates: false,
  }
}

export function formatMemberReportRevenue(value: number) {
  return formatJmdCurrency(value)
}

export function getMemberReportAppliedPeriodLabel(
  period: MemberReportPeriod,
  range: MemberReportDateRange,
) {
  switch (period) {
    case 'this-week':
      return 'This Week'
    case 'this-month':
      return 'This Month'
    case 'this-year':
      return 'This Year'
    case 'custom':
      return `${formatMemberReportDate(range.startDate)} to ${formatMemberReportDate(range.endDate)}`
    default:
      return `${formatMemberReportDate(range.startDate)} to ${formatMemberReportDate(range.endDate)}`
  }
}

export function isValidMemberReportDateRange(range: MemberReportDateRange) {
  return (
    Boolean(parseDateInputValue(range.startDate)) &&
    Boolean(parseDateInputValue(range.endDate)) &&
    range.startDate <= range.endDate
  )
}

export async function fetchMemberSignupsReport(
  startDate: string,
  endDate: string,
): Promise<MemberSignupsReport> {
  const searchParams = buildSearchParams({ startDate, endDate })
  const response = await fetch(`/api/reports/members/signups?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the member signup report.'))
  }

  const parsed = memberSignupsReportSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the member signup report.')
  }

  return parsed.data
}

export async function fetchMemberExpiredReport(
  startDate: string,
  endDate: string,
): Promise<MemberExpiredReport> {
  const searchParams = buildSearchParams({ startDate, endDate })
  const response = await fetch(`/api/reports/members/expired?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the member expiry report.'))
  }

  const parsed = memberExpiredReportSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the member expiry report.')
  }

  return parsed.data
}
