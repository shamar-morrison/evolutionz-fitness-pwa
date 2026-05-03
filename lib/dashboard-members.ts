import { z } from 'zod'
import { getAssignedCardNo } from '@/lib/member-card'
import { getCleanMemberName } from '@/lib/member-name'
import { buildCardCodeByCardNo } from '@/lib/members'
import type { CardRecord, DashboardMemberListItem } from '@/types'

type DashboardMemberRecord = {
  id: string
  employee_no: string
  name: string
  card_no: string | null
  type: DashboardMemberListItem['type']
  status: DashboardMemberListItem['status']
  end_time: string | null
  created_at: string
}

type DashboardMembersErrorResponse = {
  error: string
}

export type DashboardMembersReadClient = {
  from(table: string): any
}

export const DASHBOARD_MEMBER_SELECT =
  'id, employee_no, name, card_no, type, status, end_time, created_at'

const dashboardMemberSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  status: z.enum(['Active', 'Expired', 'Suspended', 'Paused']),
  endTime: z.string().trim().min(1).nullable(),
})

const dashboardMembersResponseSchema = z.object({
  members: z.array(dashboardMemberSchema).default([]),
})

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestampValue(
  value: unknown,
  options: { preserveRaw?: boolean } = {},
) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return null
  }

  return options.preserveRaw ? normalizedValue : timestamp.toISOString()
}

function getUniqueAssignedCardNos(memberRecords: DashboardMemberRecord[]) {
  return Array.from(
    new Set(
      memberRecords
        .map((record) => getAssignedCardNo(record.card_no))
        .filter((cardNo): cardNo is string => cardNo !== null),
    ),
  )
}

async function loadCardCodeLookup(
  supabase: DashboardMembersReadClient,
  memberRecords: DashboardMemberRecord[],
) {
  const cardNos = getUniqueAssignedCardNos(memberRecords)

  if (cardNos.length === 0) {
    return buildCardCodeByCardNo([])
  }

  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('card_no, card_code, status, lost_at')
    .in('card_no', cardNos)

  if (cardsError) {
    throw new Error(`Failed to read dashboard member card details: ${cardsError.message}`)
  }

  return buildCardCodeByCardNo((cards ?? []) as CardRecord[])
}

function mapDashboardMemberRecordToListItem(
  record: DashboardMemberRecord,
  cardCodeByCardNo: ReturnType<typeof buildCardCodeByCardNo>,
  options: { preserveRawEndTime?: boolean } = {},
): DashboardMemberListItem {
  const employeeNo = normalizeText(record.employee_no)
  const cardNo = getAssignedCardNo(record.card_no)
  const cardCode = cardNo ? cardCodeByCardNo.get(cardNo)?.cardCode ?? null : null

  return {
    id: normalizeText(record.id),
    name: getCleanMemberName(normalizeText(record.name) || employeeNo, cardCode) || employeeNo,
    type: record.type,
    status: record.status,
    endTime: normalizeTimestampValue(record.end_time, {
      preserveRaw: options.preserveRawEndTime,
    }),
  }
}

async function mapDashboardMemberRecords(
  supabase: DashboardMembersReadClient,
  memberRecords: DashboardMemberRecord[],
  options: { preserveRawEndTime?: boolean } = {},
) {
  if (memberRecords.length === 0) {
    return []
  }

  const cardCodeByCardNo = await loadCardCodeLookup(supabase, memberRecords)

  return memberRecords.map((record) =>
    mapDashboardMemberRecordToListItem(record, cardCodeByCardNo, options),
  )
}

function getDashboardMembersError(responseBody: unknown) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return (responseBody as DashboardMembersErrorResponse).error
  }

  return null
}

async function fetchDashboardMembers(path: string) {
  const response = await fetch(path, {
    method: 'GET',
  })

  let responseBody: { members: DashboardMemberListItem[] } | DashboardMembersErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | { members: DashboardMemberListItem[] }
      | DashboardMembersErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    throw new Error(getDashboardMembersError(responseBody) ?? 'Failed to load dashboard members.')
  }

  return normalizeDashboardMembers(responseBody)
}

export function normalizeDashboardMembers(input: unknown): DashboardMemberListItem[] {
  const parsed = dashboardMembersResponseSchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Dashboard members returned an unexpected response.')
  }

  return parsed.data.members
}

export async function fetchRecentDashboardMembers(): Promise<DashboardMemberListItem[]> {
  return fetchDashboardMembers('/api/dashboard/recent-members')
}

export async function fetchExpiringDashboardMembers(
  options: { limit?: number } = {},
): Promise<DashboardMemberListItem[]> {
  const searchParams = new URLSearchParams()

  if (typeof options.limit === 'number') {
    searchParams.set('limit', String(options.limit))
  }

  return fetchDashboardMembers(
    `/api/dashboard/expiring-members${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
  )
}

export async function readRecentDashboardMembers(
  supabase: DashboardMembersReadClient,
  limit = 8,
) {
  const { data, error } = await supabase
    .from('members')
    .select(DASHBOARD_MEMBER_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to read recent dashboard members: ${error.message}`)
  }

  return mapDashboardMemberRecords(supabase, (data ?? []) as DashboardMemberRecord[])
}

export async function readExpiringDashboardMembers(
  supabase: DashboardMembersReadClient,
  startInclusive: string,
  endExclusive: string,
  limit?: number,
) {
  let query = supabase
    .from('members')
    .select(DASHBOARD_MEMBER_SELECT)
    .eq('status', 'Active')
    .gte('end_time', startInclusive)
    .lt('end_time', endExclusive)
    .order('end_time', { ascending: true })

  if (typeof limit === 'number') {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read expiring dashboard members: ${error.message}`)
  }

  return mapDashboardMemberRecords(supabase, (data ?? []) as DashboardMemberRecord[], {
    preserveRawEndTime: true,
  })
}
