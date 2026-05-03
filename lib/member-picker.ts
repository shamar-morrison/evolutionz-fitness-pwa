import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import { getAssignedCardNo } from '@/lib/member-card'
import { getCleanMemberName } from '@/lib/member-name'
import { buildCardCodeByCardNo } from '@/lib/members'
import type { CardRecord, MemberStatus } from '@/types'

const memberPickerMemberSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().min(1).nullable(),
})

const memberPickerResponseSchema = z.object({
  members: z.array(memberPickerMemberSchema).default([]),
})

type MemberPickerRecord = {
  id: string
  employee_no: string
  name: string
  email: string | null
  card_no: string | null
  status: MemberStatus
  created_at: string
}

export type MemberPickerMember = z.infer<typeof memberPickerMemberSchema>

export type FetchMemberPickerOptions = {
  status?: MemberStatus
  hasEmail?: boolean
}

export type MemberPickerReadClient = {
  from(table: string): any
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  return normalizedValue ? normalizedValue.toLowerCase() : null
}

function getUniqueAssignedCardNos(memberRecords: MemberPickerRecord[]) {
  return Array.from(
    new Set(
      memberRecords
        .map((record) => getAssignedCardNo(record.card_no))
        .filter((cardNo): cardNo is string => cardNo !== null),
    ),
  )
}

async function loadCardCodeLookup(
  supabase: MemberPickerReadClient,
  memberRecords: MemberPickerRecord[],
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
    throw new Error(`Failed to read member picker card details: ${cardsError.message}`)
  }

  return buildCardCodeByCardNo((cards ?? []) as CardRecord[])
}

function mapMemberPickerRecord(
  record: MemberPickerRecord,
  cardCodeByCardNo: ReturnType<typeof buildCardCodeByCardNo>,
): MemberPickerMember {
  const employeeNo = normalizeText(record.employee_no)
  const cardNo = getAssignedCardNo(record.card_no)
  const cardCode = cardNo ? cardCodeByCardNo.get(cardNo)?.cardCode ?? null : null
  const cleanName = getCleanMemberName(normalizeText(record.name) || employeeNo, cardCode) || employeeNo

  return {
    id: normalizeText(record.id),
    name: cleanName,
    email: normalizeEmail(record.email),
  }
}

export function normalizeMemberPickerMembers(input: unknown): MemberPickerMember[] {
  const parsed = memberPickerResponseSchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Member picker returned an unexpected response.')
  }

  return parsed.data.members
}

export async function fetchMemberPickerMembers(
  options: FetchMemberPickerOptions = {},
): Promise<MemberPickerMember[]> {
  const searchParams = new URLSearchParams()

  if (options.status) {
    searchParams.set('status', options.status)
  }

  if (options.hasEmail) {
    searchParams.set('hasEmail', 'true')
  }

  const responseBody = await apiFetch(
    `/api/members/picker${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
    },
    memberPickerResponseSchema,
    'Failed to load member picker options.',
  )

  return responseBody.members
}

export async function readMemberPickerMembers(
  supabase: MemberPickerReadClient,
  options: FetchMemberPickerOptions = {},
) {
  let query = supabase
    .from('members')
    .select('id, employee_no, name, email, card_no, status, created_at')
    .order('created_at', { ascending: false })

  if (options.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read member picker options: ${error.message}`)
  }

  const memberRecords = (data ?? []) as MemberPickerRecord[]
  const cardCodeByCardNo = await loadCardCodeLookup(supabase, memberRecords)
  const members = memberRecords.map((record) => mapMemberPickerRecord(record, cardCodeByCardNo))

  if (!options.hasEmail) {
    return members
  }

  return members.filter((member) => member.email !== null)
}
