import { getJamaicaDateValue, getDateRangeBoundsInJamaica } from '@/lib/pt-scheduling'
import { parseDateInputValue } from '@/lib/member-access-time'
import { createEmptyMemberReportRevenueBreakdown, type MemberReportRevenueBreakdown } from '@/lib/member-reports'
import type { MemberStatus, MemberType } from '@/types'

export type MemberReportsAdminClient = {
  from(table: string): any
}

type MemberSignupReportRow = {
  id: string
  name: string
  type: MemberType
  status: MemberStatus
  joined_at: string | null
  member_type_id: string | null
}

type MemberExpiredReportRow = {
  id: string
  name: string
  type: MemberType
  status: MemberStatus
  end_time: string | null
  member_type_id: string | null
}

type MemberPaymentRevenueRow = {
  member_id: string
  member_type_id: string | null
  payment_type: 'membership' | 'card_fee'
  amount_paid: number | string
  payment_date: string
}

type MemberTypeRevenueRow = {
  id: string
  name: string
  monthly_rate: number | string
}

type MemberRevenueSource = {
  id: string
  memberTypeId: string | null
}

const MEMBER_TYPE_ORDER: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeText(value)

  return normalizedValue || null
}

function normalizeDate(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  return parseDateInputValue(normalizedValue) ? normalizedValue : null
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

function compareMemberTypeLabels(left: string, right: string) {
  const leftIndex = MEMBER_TYPE_ORDER.indexOf(left as MemberType)
  const rightIndex = MEMBER_TYPE_ORDER.indexOf(right as MemberType)

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

async function loadMemberReportTypes(
  supabase: MemberReportsAdminClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return new Map<string, MemberTypeRevenueRow>()
  }

  const { data, error } = await supabase
    .from('member_types')
    .select('id, name, monthly_rate')
    .in('id', ids)

  if (error) {
    throw new Error(`Failed to read membership types for the member report: ${error.message}`)
  }

  return new Map(((data ?? []) as MemberTypeRevenueRow[]).map((row) => [row.id, row]))
}

async function buildMemberReportRevenueBreakdown(
  supabase: MemberReportsAdminClient,
  members: MemberRevenueSource[],
  filters: {
    startDate: string
    endDate: string
  },
): Promise<MemberReportRevenueBreakdown> {
  if (members.length === 0) {
    return createEmptyMemberReportRevenueBreakdown()
  }

  const memberIds = members.map((member) => member.id)
  const { data, error } = await supabase
    .from('member_payments')
    .select('member_id, member_type_id, payment_type, amount_paid, payment_date')
    .in('member_id', memberIds)
    .gte('payment_date', filters.startDate)
    .lte('payment_date', filters.endDate)

  if (error) {
    throw new Error(`Failed to read member payments for the member report: ${error.message}`)
  }

  const payments = (data ?? []) as MemberPaymentRevenueRow[]
  const memberTypeIds = Array.from(
    new Set(
      [
        ...payments.map((payment) => normalizeNullableText(payment.member_type_id)),
        ...members.map((member) => normalizeNullableText(member.memberTypeId)),
      ].filter((value): value is string => Boolean(value)),
    ),
  )
  const memberTypeById = await loadMemberReportTypes(supabase, memberTypeIds)
  const actualTotalsByType = new Map<string, number>()
  const memberIdsWithPayment = new Set<string>()
  let cardFeesTotal = 0

  for (const payment of payments) {
    const memberId = normalizeText(payment.member_id)

    if (!memberId) {
      continue
    }

    memberIdsWithPayment.add(memberId)

    const amount = normalizeAmount(payment.amount_paid)

    if (payment.payment_type === 'card_fee') {
      cardFeesTotal += amount
      continue
    }

    const memberTypeId = normalizeNullableText(payment.member_type_id)
    const memberTypeLabel =
      (memberTypeId ? normalizeText(memberTypeById.get(memberTypeId)?.name) : '') || 'Unknown'

    actualTotalsByType.set(memberTypeLabel, (actualTotalsByType.get(memberTypeLabel) ?? 0) + amount)
  }

  let estimatedTotal = 0

  for (const member of members) {
    if (memberIdsWithPayment.has(member.id)) {
      continue
    }

    const memberTypeId = normalizeNullableText(member.memberTypeId)

    if (!memberTypeId) {
      continue
    }

    const memberType = memberTypeById.get(memberTypeId)
    const monthlyRate = normalizeAmount(memberType?.monthly_rate)

    if (monthlyRate <= 0) {
      continue
    }

    estimatedTotal += monthlyRate
  }

  const byType = Array.from(actualTotalsByType.entries())
    .filter(([, total]) => total !== 0)
    .sort(([leftLabel], [rightLabel]) => compareMemberTypeLabels(leftLabel, rightLabel))
    .map(([label, total]) => ({
      label,
      total,
      isEstimate: false,
    }))

  if (cardFeesTotal !== 0) {
    byType.push({
      label: 'Card Fees',
      total: cardFeesTotal,
      isEstimate: false,
    })
  }

  if (estimatedTotal !== 0) {
    byType.push({
      label: 'Estimated (no payment recorded)',
      total: estimatedTotal,
      isEstimate: true,
    })
  }

  return {
    byType,
    total: byType.reduce((sum, item) => sum + item.total, 0),
    hasEstimates: estimatedTotal !== 0,
  }
}

export async function readMemberSignupsReport(
  supabase: MemberReportsAdminClient,
  filters: {
    startDate: string
    endDate: string
  },
) {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, type, status, joined_at, member_type_id')
    .not('joined_at', 'is', null)
    .gte('joined_at', filters.startDate)
    .lte('joined_at', filters.endDate)
    .order('joined_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read members for the signup report: ${error.message}`)
  }

  const normalizedMembers = ((data ?? []) as MemberSignupReportRow[])
    .map((member) => {
      const joinedAt = normalizeDate(member.joined_at)

      if (!joinedAt) {
        return null
      }

      return {
        id: normalizeText(member.id),
        name: normalizeText(member.name),
        type: member.type,
        status: member.status,
        joinedAt,
        memberTypeId: normalizeNullableText(member.member_type_id),
      }
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member))

  const revenueBreakdown = await buildMemberReportRevenueBreakdown(supabase, normalizedMembers, filters)

  return {
    members: normalizedMembers.map(({ memberTypeId: _memberTypeId, ...member }) => member),
    revenueBreakdown,
  }
}

export async function readMemberExpiredReport(
  supabase: MemberReportsAdminClient,
  filters: {
    startDate: string
    endDate: string
  },
) {
  const bounds = getDateRangeBoundsInJamaica(filters.startDate, filters.endDate)

  if (!bounds) {
    throw new Error('Member expiry report dates must use valid YYYY-MM-DD values.')
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name, type, status, end_time, member_type_id')
    .gte('end_time', bounds.startInclusive)
    .lt('end_time', bounds.endExclusive)
    .order('end_time', { ascending: false })

  if (error) {
    throw new Error(`Failed to read members for the expiry report: ${error.message}`)
  }

  const normalizedMembers = ((data ?? []) as MemberExpiredReportRow[])
    .map((member) => {
      const expiryDate = member.end_time ? getJamaicaDateValue(member.end_time) : null

      if (!expiryDate) {
        return null
      }

      return {
        id: normalizeText(member.id),
        name: normalizeText(member.name),
        type: member.type,
        status: member.status,
        expiryDate,
        memberTypeId: normalizeNullableText(member.member_type_id),
      }
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member))

  const revenueBreakdown = await buildMemberReportRevenueBreakdown(supabase, normalizedMembers, filters)

  return {
    members: normalizedMembers.map(({ memberTypeId: _memberTypeId, ...member }) => member),
    revenueBreakdown,
  }
}
