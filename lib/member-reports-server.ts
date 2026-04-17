import { getJamaicaDateValue, getDateRangeBoundsInJamaica } from '@/lib/pt-scheduling'
import { parseDateInputValue } from '@/lib/member-access-time'
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
}

type MemberExpiredReportRow = {
  id: string
  name: string
  type: MemberType
  status: MemberStatus
  end_time: string | null
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDate(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  return parseDateInputValue(normalizedValue) ? normalizedValue : null
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
    .select('id, name, type, status, joined_at')
    .not('joined_at', 'is', null)
    .gte('joined_at', filters.startDate)
    .lte('joined_at', filters.endDate)
    .order('joined_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read members for the signup report: ${error.message}`)
  }

  const members = ((data ?? []) as MemberSignupReportRow[])
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
      }
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member))

  return { members }
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
    .select('id, name, type, status, end_time')
    .gte('end_time', bounds.startInclusive)
    .lt('end_time', bounds.endExclusive)
    .order('end_time', { ascending: false })

  if (error) {
    throw new Error(`Failed to read members for the expiry report: ${error.message}`)
  }

  const members = ((data ?? []) as MemberExpiredReportRow[])
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
      }
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member))

  return { members }
}
