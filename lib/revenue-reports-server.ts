import {
  REVENUE_REPORT_MEMBER_TYPE_ORDER,
  REVENUE_REPORT_PAYMENT_METHOD_ORDER,
  type CardFeeRevenueReport,
  type MembershipRevenueReport,
  type OverallRevenueReport,
  formatPaymentMethodLabel,
  type PtRevenueReport,
} from '@/lib/revenue-reports'
import { getDateRangeBoundsInJamaica } from '@/lib/pt-scheduling'
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
}

type MemberTypeSummaryRow = {
  id: string
  name: string
}

type PtSessionRevenueRow = {
  id: string
  assignment_id: string
  trainer_id: string
  member_id: string
  scheduled_at: string
  status: 'completed'
}

type TrainerClientRevenueRow = {
  id: string
  pt_fee: number | string
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

async function loadPtFeesByAssignmentId(
  supabase: RevenueReportsAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, number>()
  }

  const { data, error } = await supabase
    .from('trainer_clients')
    .select('id, pt_fee')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read PT fees for the revenue report: ${error.message}`)
  }

  return new Map(
    ((data ?? []) as TrainerClientRevenueRow[]).map((row) => [row.id, normalizeAmount(row.pt_fee)]),
  )
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
  const dateRange = getDateRangeBoundsInJamaica(filters.from, filters.to)

  if (!dateRange) {
    throw new Error('PT revenue report dates must use valid YYYY-MM-DD values.')
  }

  const { data, error } = await supabase
    .from('pt_sessions')
    .select('id, assignment_id, trainer_id, member_id, scheduled_at, status')
    .eq('status', 'completed')
    .gte('scheduled_at', dateRange.startInclusive)
    .lt('scheduled_at', dateRange.endExclusive)
    .order('scheduled_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read PT sessions for the revenue report: ${error.message}`)
  }

  const sessions = (data ?? []) as PtSessionRevenueRow[]

  if (sessions.length === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalSessionsCompleted: 0,
      },
      sessions: [],
      totalsByTrainer: [],
    }
  }

  const assignmentIds = Array.from(new Set(sessions.map((session) => session.assignment_id)))
  const trainerIds = Array.from(new Set(sessions.map((session) => session.trainer_id)))
  const memberIds = Array.from(new Set(sessions.map((session) => session.member_id)))
  const [ptFeeByAssignmentId, trainerById, memberById] = await Promise.all([
    loadPtFeesByAssignmentId(supabase, assignmentIds),
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
    }
  >()

  const reportSessions = sessions.map((session) => {
    const ptFee = ptFeeByAssignmentId.get(session.assignment_id) ?? 0
    const trainerName = normalizeText(trainerById.get(session.trainer_id)?.name) || 'Unknown trainer'
    const memberName = normalizeText(memberById.get(session.member_id)?.name) || 'Unknown member'
    const trainerTotals = totalsByTrainer.get(session.trainer_id) ?? {
      trainerId: session.trainer_id,
      trainerName,
      totalRevenue: 0,
      sessionCount: 0,
    }

    trainerTotals.totalRevenue += ptFee
    trainerTotals.sessionCount += 1
    totalsByTrainer.set(session.trainer_id, trainerTotals)

    return {
      id: session.id,
      memberName,
      trainerName,
      ptFee,
      sessionDate: session.scheduled_at,
    }
  })

  return {
    summary: {
      totalRevenue: reportSessions.reduce((sum, session) => sum + session.ptFee, 0),
      totalSessionsCompleted: reportSessions.length,
    },
    sessions: reportSessions,
    totalsByTrainer: Array.from(totalsByTrainer.values()).sort((left, right) =>
      left.trainerName.localeCompare(right.trainerName),
    ),
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
