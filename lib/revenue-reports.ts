import { z } from 'zod'
import { addDaysToDateValue, getClassDayOfWeekFromDateValue } from '@/lib/classes'
import { getJamaicaDateInputValue } from '@/lib/member-access-time'
import {
  formatJmdCurrency,
  getCurrentMonthDateRangeInJamaica,
  isDateValue,
  JAMAICA_OFFSET,
  JAMAICA_TIME_ZONE,
} from '@/lib/pt-scheduling'
import type { MemberPaymentMethod } from '@/types'

const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().trim().min(1),
})

const membershipRevenueReportSchema = z.object({
  summary: z.object({
    totalRevenue: z.number().finite(),
    totalPayments: z.number().int().nonnegative(),
  }),
  payments: z.array(
    z.object({
      id: z.string().trim().min(1),
      memberName: z.string().trim().min(1),
      memberTypeName: z.string().trim().min(1),
      amount: z.number().finite(),
      paymentMethod: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
      paymentDate: z.string().trim().min(1),
      notes: z.string().nullable(),
    }),
  ),
  totalsByMemberType: z.array(
    z.object({
      memberTypeName: z.string().trim().min(1),
      totalRevenue: z.number().finite(),
      paymentCount: z.number().int().nonnegative(),
    }),
  ),
  totalsByPaymentMethod: z.array(
    z.object({
      paymentMethod: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
      totalRevenue: z.number().finite(),
      paymentCount: z.number().int().nonnegative(),
    }),
  ),
})

const ptRevenueReportSchema = z.object({
  summary: z.object({
    totalRevenue: z.number().finite(),
    totalSessionsCompleted: z.number().int().nonnegative(),
  }),
  sessions: z.array(
    z.object({
      id: z.string().trim().min(1),
      memberName: z.string().trim().min(1),
      trainerName: z.string().trim().min(1),
      ptFee: z.number().finite(),
      sessionDate: z.string().trim().min(1),
    }),
  ),
  totalsByTrainer: z.array(
    z.object({
      trainerId: z.string().trim().min(1),
      trainerName: z.string().trim().min(1),
      totalRevenue: z.number().finite(),
      sessionCount: z.number().int().nonnegative(),
    }),
  ),
})

const overallRevenueReportSchema = z.object({
  summary: z.object({
    grandTotal: z.number().finite(),
    membershipRevenue: z.number().finite(),
    ptRevenue: z.number().finite(),
  }),
  breakdown: z.array(
    z.object({
      revenueStream: z.enum(['Membership', 'PT Revenue']),
      amount: z.number().finite(),
      percentageOfTotal: z.number().finite(),
    }),
  ),
})

export type RevenuePeriod = 'today' | 'this-week' | 'this-month' | 'this-year' | 'custom'

export type DateRangeValue = {
  from: string
  to: string
}

export type MembershipRevenueReport = z.infer<typeof membershipRevenueReportSchema>
export type PtRevenueReport = z.infer<typeof ptRevenueReportSchema>
export type OverallRevenueReport = z.infer<typeof overallRevenueReportSchema>

export const REVENUE_PERIOD_OPTIONS: Array<{
  label: string
  value: RevenuePeriod
}> = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'This Year', value: 'this-year' },
  { label: 'Custom Range', value: 'custom' },
]

export const REVENUE_REPORT_MEMBER_TYPE_ORDER = [
  'General',
  'Civil Servant',
  'Student/BPO',
] as const

export const REVENUE_REPORT_PAYMENT_METHOD_ORDER: MemberPaymentMethod[] = [
  'cash',
  'fygaro',
  'bank_transfer',
  'point_of_sale',
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

function createDateRange(from: string, to: string) {
  return { from, to }
}

export function formatPaymentMethodLabel(paymentMethod: MemberPaymentMethod) {
  switch (paymentMethod) {
    case 'cash':
      return 'Cash'
    case 'fygaro':
      return 'Fygaro'
    case 'bank_transfer':
      return 'Bank Transfer'
    case 'point_of_sale':
      return 'Point of Sale'
    default:
      return paymentMethod
  }
}

export function formatRevenueReportDate(value: string) {
  const date = new Date(`${value}T00:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function formatRevenueReportDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatGeneratedTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatRevenuePercentage(value: number) {
  return `${value.toFixed(1)}%`
}

export function formatRevenueCurrency(value: number) {
  return formatJmdCurrency(value)
}

export function isRevenuePeriod(value: string): value is RevenuePeriod {
  return REVENUE_PERIOD_OPTIONS.some((option) => option.value === value)
}

export function isDateRangeValue(value: DateRangeValue | null): value is DateRangeValue {
  return Boolean(value?.from && value?.to && isDateValue(value.from) && isDateValue(value.to))
}

export function getRevenueDateRangeForPeriod(
  period: RevenuePeriod,
  now = new Date(),
): DateRangeValue {
  const today = getJamaicaDateInputValue(now)

  switch (period) {
    case 'today':
      return createDateRange(today, today)
    case 'this-week': {
      const dayOfWeek = getClassDayOfWeekFromDateValue(today)

      if (dayOfWeek === null) {
        throw new Error('Failed to resolve the current Jamaica week range.')
      }

      const from = addDaysToDateValue(today, -dayOfWeek)
      const to = addDaysToDateValue(today, 6 - dayOfWeek)

      if (!from || !to) {
        throw new Error('Failed to resolve the current Jamaica week range.')
      }

      return createDateRange(from, to)
    }
    case 'this-month': {
      const monthRange = getCurrentMonthDateRangeInJamaica(now)

      return createDateRange(monthRange.startDate, monthRange.endDate)
    }
    case 'this-year': {
      const year = today.slice(0, 4)

      return createDateRange(`${year}-01-01`, `${year}-12-31`)
    }
    case 'custom':
      return createDateRange('', '')
    default:
      return createDateRange(today, today)
  }
}

export async function fetchMembershipRevenueReport(
  from: string,
  to: string,
): Promise<MembershipRevenueReport> {
  const searchParams = buildSearchParams({ from, to })
  const response = await fetch(`/api/reports/revenue/membership?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the membership revenue report.'))
  }

  const parsed = membershipRevenueReportSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the membership revenue report.')
  }

  return parsed.data
}

export async function fetchPtRevenueReport(from: string, to: string): Promise<PtRevenueReport> {
  const searchParams = buildSearchParams({ from, to })
  const response = await fetch(`/api/reports/revenue/pt?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the PT revenue report.'))
  }

  const parsed = ptRevenueReportSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the PT revenue report.')
  }

  return parsed.data
}

export async function fetchOverallRevenueReport(
  from: string,
  to: string,
): Promise<OverallRevenueReport> {
  const searchParams = buildSearchParams({ from, to })
  const response = await fetch(`/api/reports/revenue/overall?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the overall revenue report.'))
  }

  const parsed = overallRevenueReportSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the overall revenue report.')
  }

  return parsed.data
}
