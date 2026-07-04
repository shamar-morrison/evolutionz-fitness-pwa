import {
  REVENUE_REPORT_MEMBER_TYPE_ORDER,
  REVENUE_REPORT_PAYMENT_METHOD_ORDER,
  type CardFeeRevenueReport,
  type MembershipRevenueReport,
  type OverallRevenueReport,
  formatPaymentMethodLabel,
  type PtRevenueReport,
} from '@/lib/revenue-reports'
import { getCleanMemberName } from '@/lib/member-name'
import type { MemberPaymentMethod } from '@/types'

export type RevenueReportsAdminClient = {
  from(table: string): any
}

type MemberPaymentRow = {
  id: string
  member_id: string
  member_type_id: string | null
  payment_type: 'membership' | 'card_fee'
  payment_method: MemberPaymentMethod
  amount_paid: number | string
  payment_date: string
  notes: string | null
}

type MemberSummaryRow = {
  id: string
  name: string
  card_code?: string | null
}

type MemberTypeSummaryRow = {
  id: string
  name: string
}

type PtPaymentRevenueRow = {
  id: string
  trainer_id: string | null
  member_id: string
  amount: number | string
  months_covered: number
  payment_method: MemberPaymentMethod
  notes: string | null
  payment_date: string
}

type ProfileSummaryRow = {
  id: string
  name: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

function normalizeNullableAmount(value: unknown) {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function compareMemberTypeNames(left: string, right: string) {
  const leftIndex = REVENUE_REPORT_MEMBER_TYPE_ORDER.indexOf(
    left as (typeof REVENUE_REPORT_MEMBER_TYPE_ORDER)[number],
  )
  const rightIndex = REVENUE_REPORT_MEMBER_TYPE_ORDER.indexOf(
    right as (typeof REVENUE_REPORT_MEMBER_TYPE_ORDER)[number],
  )

  if (leftIndex !== -1 && rightIndex !== -1) {
    return leftIndex - rightIndex
  }

  if (leftIndex !== -1) {
    return -1
  }

  if (rightIndex !== -1) {
    return 1
  }

  return left.localeCompare(right)
}

async function loadMemberNames(
  supabase: RevenueReportsAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, MemberSummaryRow>()
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read members for the revenue report: ${error.message}`)
  }

  return new Map(((data ?? []) as MemberSummaryRow[]).map((row) => [row.id, row]))
}

async function loadMemberTypeNames(
  supabase: RevenueReportsAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, MemberTypeSummaryRow>()
  }

  const { data, error } = await supabase
    .from('member_types')
    .select('id, name')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read member types for the revenue report: ${error.message}`)
  }

  return new Map(((data ?? []) as MemberTypeSummaryRow[]).map((row) => [row.id, row]))
}

async function loadTrainerNames(
  supabase: RevenueReportsAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, ProfileSummaryRow>()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read trainers for the revenue report: ${error.message}`)
  }

  return new Map(((data ?? []) as ProfileSummaryRow[]).map((row) => [row.id, row]))
}

export async function readMembershipRevenueReport(
  supabase: RevenueReportsAdminClient,
  filters: {
    from: string
    to: string
  },
): Promise<MembershipRevenueReport> {
  const { data, error } = await supabase
    .from('member_payments')
    .select('id, member_id, member_type_id, payment_type, payment_method, amount_paid, payment_date, notes')
    .eq('payment_type', 'membership')
    .gte('payment_date', filters.from)
    .lte('payment_date', filters.to)
    .order('payment_date', { ascending: false })

  if (error) {
    throw new Error(`Failed to read member payments for the revenue report: ${error.message}`)
  }

  const payments = (data ?? []) as MemberPaymentRow[]

  if (payments.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalPayments: 0,
      },
      payments: [],
      totalsByMemberType: REVENUE_REPORT_MEMBER_TYPE_ORDER.map((memberTypeName) => ({
        memberTypeName,
        totalRevenue: 0,
        paymentCount: 0,
      })),
      totalsByPaymentMethod: REVENUE_REPORT_PAYMENT_METHOD_ORDER.map((paymentMethod) => ({
        paymentMethod,
        totalRevenue: 0,
        paymentCount: 0,
      })),
    }
  }

  const memberIds = Array.from(new Set(payments.map((payment) => payment.member_id)))
  const memberTypeIds = Array.from(
    new Set(
      payments
        .map((payment) => payment.member_type_id)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const [memberById, memberTypeById] = await Promise.all([
    loadMemberNames(supabase, memberIds),
    loadMemberTypeNames(supabase, memberTypeIds),
  ])

  const totalsByMemberType = new Map<
    string,
    {
      memberTypeName: string
      totalRevenue: number
      paymentCount: number
    }
  >()
  const totalsByPaymentMethod = new Map<
    MemberPaymentMethod,
    {
      paymentMethod: MemberPaymentMethod
      totalRevenue: number
      paymentCount: number
    }
  >(
    REVENUE_REPORT_PAYMENT_METHOD_ORDER.map((paymentMethod) => [
      paymentMethod,
      {
        paymentMethod,
        totalRevenue: 0,
        paymentCount: 0,
      },
    ]),
  )

  for (const memberTypeName of REVENUE_REPORT_MEMBER_TYPE_ORDER) {
    totalsByMemberType.set(memberTypeName, {
      memberTypeName,
      totalRevenue: 0,
      paymentCount: 0,
    })
  }

  const reportPayments = payments.map((payment) => {
    const memberName = normalizeText(memberById.get(payment.member_id)?.name) || 'Unknown member'
    const memberTypeName =
      normalizeText(
        payment.member_type_id ? memberTypeById.get(payment.member_type_id)?.name : null,
      ) || 'Unknown'
    const amount = normalizeAmount(payment.amount_paid)
    const memberTypeTotals = totalsByMemberType.get(memberTypeName) ?? {
      memberTypeName,
      totalRevenue: 0,
      paymentCount: 0,
    }
    const paymentMethodTotals = totalsByPaymentMethod.get(payment.payment_method) ?? {
      paymentMethod: payment.payment_method,
      totalRevenue: 0,
      paymentCount: 0,
    }

    memberTypeTotals.totalRevenue += amount
    memberTypeTotals.paymentCount += 1
    paymentMethodTotals.totalRevenue += amount
    paymentMethodTotals.paymentCount += 1

    totalsByMemberType.set(memberTypeName, memberTypeTotals)
    totalsByPaymentMethod.set(payment.payment_method, paymentMethodTotals)

    return {
      id: payment.id,
      memberId: normalizeText(payment.member_id),
      memberName,
      memberTypeName,
      amount,
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date,
      notes: normalizeText(payment.notes) || null,
    }
  })

  const totalRevenue = reportPayments.reduce((sum, payment) => sum + payment.amount, 0)

  return {
    summary: {
      totalRevenue,
      totalPayments: reportPayments.length,
    },
    payments: reportPayments,
    totalsByMemberType: Array.from(totalsByMemberType.values()).sort((left, right) =>
      compareMemberTypeNames(left.memberTypeName, right.memberTypeName),
    ),
    totalsByPaymentMethod: REVENUE_REPORT_PAYMENT_METHOD_ORDER.map((paymentMethod) => {
      const totals = totalsByPaymentMethod.get(paymentMethod)

      return (
        totals ?? {
          paymentMethod,
          totalRevenue: 0,
          paymentCount: 0,
        }
      )
    }),
  }
}

export async function readCardFeeRevenueReport(
  supabase: RevenueReportsAdminClient,
  filters: {
    from: string
    to: string
  },
): Promise<CardFeeRevenueReport> {
  const { data, error } = await supabase
    .from('member_payments')
    .select('id, member_id, member_type_id, payment_type, payment_method, amount_paid, payment_date, notes')
    .eq('payment_type', 'card_fee')
    .gte('payment_date', filters.from)
    .lte('payment_date', filters.to)
    .order('payment_date', { ascending: false })

  if (error) {
    throw new Error(`Failed to read card fee payments for the revenue report: ${error.message}`)
  }

  const payments = (data ?? []) as MemberPaymentRow[]

  if (payments.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalPayments: 0,
      },
      payments: [],
      monthlyBreakdown: [],
    }
  }

  const memberIds = Array.from(new Set(payments.map((payment) => payment.member_id)))
  const memberById = await loadMemberNames(supabase, memberIds)
  const monthlyTotals = new Map<
    string,
    {
      month: string
      totalRevenue: number
      paymentCount: number
    }
  >()

  const reportPayments = payments.map((payment) => {
    const memberName = normalizeText(memberById.get(payment.member_id)?.name) || 'Unknown member'
    const amount = normalizeAmount(payment.amount_paid)
    const month = payment.payment_date.slice(0, 7)
    const monthlyTotal = monthlyTotals.get(month) ?? {
      month,
      totalRevenue: 0,
      paymentCount: 0,
    }

    monthlyTotal.totalRevenue += amount
    monthlyTotal.paymentCount += 1
    monthlyTotals.set(month, monthlyTotal)

    return {
      id: payment.id,
      memberId: normalizeText(payment.member_id),
      memberName,
      amount,
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date,
      notes: normalizeText(payment.notes) || null,
    }
  })

  return {
    summary: {
      totalRevenue: reportPayments.reduce((sum, payment) => sum + payment.amount, 0),
      totalPayments: reportPayments.length,
    },
    payments: reportPayments,
    monthlyBreakdown: Array.from(monthlyTotals.values()).sort((left, right) =>
      left.month.localeCompare(right.month),
    ),
  }
}

export async function readPtRevenueReport(
  supabase: RevenueReportsAdminClient,
  filters: {
    from: string
    to: string
  },
): Promise<PtRevenueReport> {
  const { data, error } = await supabase
    .from('pt_payments')
    .select('id, trainer_id, member_id, amount, months_covered, payment_method, notes, payment_date')
    .gte('payment_date', filters.from)
    .lte('payment_date', filters.to)
    .order('payment_date', { ascending: false })

  if (error) {
    throw new Error(`Failed to read PT payments for the revenue report: ${error.message}`)
  }

  const payments = (data ?? []) as PtPaymentRevenueRow[]

  if (payments.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalSessionsCompleted: 0,
      },
      sessions: [],
      totalsByTrainer: [],
    }
  }

  const trainerIds = Array.from(
    new Set(payments.map((payment) => payment.trainer_id).filter((value): value is string => Boolean(value))),
  )
  const memberIds = Array.from(new Set(payments.map((payment) => payment.member_id)))
  const [trainerById, memberById] = await Promise.all([
    loadTrainerNames(supabase, trainerIds),
    loadMemberNames(supabase, memberIds),
  ])

  const totalsByTrainer = new Map<
    string,
    {
      trainerId: string
      trainerName: string
      totalRevenue: number
      sessionCount: number
      payments: Array<{
        id: string
        memberId: string
        memberName: string
        amount: number
        monthsCovered: number
        paymentMethod: MemberPaymentMethod
        paymentDate: string
        notes: string | null
      }>
    }
  >()

  for (const payment of payments) {
    const amount = normalizeAmount(payment.amount)
    const trainerId = payment.trainer_id ?? 'unassigned'
    const trainerName = payment.trainer_id
      ? normalizeText(trainerById.get(payment.trainer_id)?.name) || 'Unknown trainer'
      : 'Unassigned'
    const member = memberById.get(payment.member_id)
    const fallbackMemberName = normalizeText(member?.name) || 'Unknown member'
    const trainerTotals = totalsByTrainer.get(trainerId) ?? {
      trainerId,
      trainerName,
      totalRevenue: 0,
      sessionCount: 0,
      payments: [],
    }

    trainerTotals.totalRevenue += amount
    trainerTotals.payments.push({
      id: payment.id,
      memberId: payment.member_id,
      memberName: getCleanMemberName(fallbackMemberName, member?.card_code) || fallbackMemberName,
      amount,
      monthsCovered: payment.months_covered,
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date,
      notes: payment.notes,
    })
    totalsByTrainer.set(trainerId, trainerTotals)
  }

  return {
    summary: {
      totalRevenue: payments.reduce((sum, payment) => sum + normalizeAmount(payment.amount), 0),
      totalSessionsCompleted: 0,
    },
    sessions: [],
    totalsByTrainer: Array.from(totalsByTrainer.values()).sort((left, right) => {
      if (left.trainerId === 'unassigned') {
        return 1
      }

      if (right.trainerId === 'unassigned') {
        return -1
      }

      return left.trainerName.localeCompare(right.trainerName)
    }),
  }
}

export async function readOverallRevenueReport(
  supabase: RevenueReportsAdminClient,
  filters: {
    from: string
    to: string
  },
): Promise<OverallRevenueReport> {
  const [membershipReport, cardFeeReport, ptReport] = await Promise.all([
    readMembershipRevenueReport(supabase, filters),
    readCardFeeRevenueReport(supabase, filters),
    readPtRevenueReport(supabase, filters),
  ])

  const membershipRevenue = membershipReport.summary.totalRevenue
  const cardFeeRevenue = cardFeeReport.summary.totalRevenue
  const ptRevenue = ptReport.summary.totalRevenue
  const grandTotal = membershipRevenue + cardFeeRevenue + ptRevenue

  const percentageOf = (amount: number) => (grandTotal > 0 ? (amount / grandTotal) * 100 : 0)

  return {
    summary: {
      grandTotal,
      membershipRevenue,
      cardFeeRevenue,
      ptRevenue,
    },
    breakdown: [
      {
        revenueStream: 'Membership',
        amount: membershipRevenue,
        percentageOfTotal: percentageOf(membershipRevenue),
      },
      {
        revenueStream: 'Card Fees',
        amount: cardFeeRevenue,
        percentageOfTotal: percentageOf(cardFeeRevenue),
      },
      {
        revenueStream: 'PT Revenue',
        amount: ptRevenue,
        percentageOfTotal: percentageOf(ptRevenue),
      },
    ],
  }
}

export { formatPaymentMethodLabel }
