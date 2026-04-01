import { z } from 'zod'
import { getAssignedCardNo } from '@/lib/member-card'
import { getCleanMemberName } from '@/lib/member-name'
import type { CardRecord, Member, MemberRecord } from '@/types'

export const MEMBER_RECORD_SELECT =
  'id, employee_no, name, card_no, type, status, gender, email, phone, remark, photo_url, begin_time, end_time, balance, created_at, updated_at'

const memberSchema = z.object({
  id: z.string().trim().min(1, 'Member id is required.'),
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  cardNo: z.string().trim().min(1).nullable(),
  cardCode: z.string().trim().min(1).nullable(),
  slotPlaceholderName: z.string().trim().min(1).optional(),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  status: z.enum(['Active', 'Expired', 'Suspended']),
  deviceAccessState: z.enum(['ready', 'released']),
  gender: z.enum(['Male', 'Female']).nullable(),
  email: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  remark: z.string().trim().min(1).nullable(),
  photoUrl: z.string().trim().min(1).nullable(),
  beginTime: z.string().trim().min(1).nullable(),
  endTime: z.string().trim().min(1).nullable(),
  balance: z.number(),
  createdAt: z.string().trim().min(1, 'Created timestamp is required.'),
})

const membersResponseSchema = z.object({
  members: z.array(memberSchema).default([]),
})

const memberResponseSchema = z.object({
  member: memberSchema,
})

type MembersSuccessResponse = {
  ok: true
  members: Member[]
}

type MembersErrorResponse = {
  ok: false
  error: string
}

type MemberSuccessResponse = {
  ok: true
  member: Member
}

type MemberErrorResponse = {
  ok: false
  error: string
}

export type MembersReadClient = {
  from(table: string): any
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return null
  }

  return timestamp.toISOString()
}

export function mapMemberRecordToMember(record: MemberRecord): Member {
  return mapMemberRecordToMemberWithCardCode(record)
}

function getUniqueAssignedCardNos(memberRecords: MemberRecord[]) {
  return Array.from(
    new Set(
      memberRecords
        .map((record) => getAssignedCardNo(record.card_no))
        .filter((cardNo): cardNo is string => cardNo !== null),
    ),
  )
}

export function buildCardCodeByCardNo(records: CardRecord[]) {
  const cardCodeByCardNo = new Map<string, string | null>()

  for (const record of records) {
    const cardNo = normalizeText(record.card_no)

    if (!cardNo) {
      continue
    }

    const cardCode = normalizeText(record.card_code) || null
    const existingCardCode = cardCodeByCardNo.get(cardNo)

    if (!existingCardCode || cardCode) {
      cardCodeByCardNo.set(cardNo, cardCode)
    }
  }

  return cardCodeByCardNo
}

export function mapMemberRecordToMemberWithCardCode(
  record: MemberRecord,
  cardCodeByCardNo: Map<string, string | null> = new Map(),
): Member {
  const employeeNo = normalizeText(record.employee_no)
  const cardNo = getAssignedCardNo(record.card_no)
  const cardCode = cardNo ? cardCodeByCardNo.get(cardNo) ?? null : null
  const createdAt = normalizeTimestamp(record.created_at)

  return {
    id: normalizeText(record.id),
    employeeNo,
    name: getCleanMemberName(normalizeText(record.name) || employeeNo, cardCode) || employeeNo,
    cardNo,
    cardCode,
    type: record.type,
    status: record.status,
    deviceAccessState: 'ready',
    gender: record.gender,
    email: normalizeNullableText(record.email),
    phone: normalizeNullableText(record.phone),
    remark: normalizeNullableText(record.remark),
    photoUrl: normalizeNullableText(record.photo_url),
    beginTime: normalizeTimestamp(record.begin_time),
    endTime: normalizeTimestamp(record.end_time),
    balance: Number.isFinite(record.balance) ? record.balance : 0,
    createdAt: createdAt ?? normalizeText(record.created_at),
  }
}

export function normalizeMembers(input: unknown): Member[] {
  const parsed = membersResponseSchema.safeParse(input)

  if (!parsed.success) {
    return []
  }

  return parsed.data.members
}

export function normalizeMember(input: unknown): Member | null {
  const parsed = memberResponseSchema.safeParse(input)

  if (!parsed.success) {
    return null
  }

  return parsed.data.member
}

async function loadCardCodeLookup(
  supabase: MembersReadClient,
  memberRecords: MemberRecord[],
) {
  const cardNos = getUniqueAssignedCardNos(memberRecords)

  if (cardNos.length === 0) {
    return new Map<string, string | null>()
  }

  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('card_no, card_code')
    .in('card_no', cardNos)

  if (cardsError) {
    throw new Error(`Failed to read member card codes: ${cardsError.message}`)
  }

  return buildCardCodeByCardNo((cards ?? []) as CardRecord[])
}

export async function readMembersWithCardCodes(supabase: MembersReadClient) {
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_RECORD_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read members: ${error.message}`)
  }

  const memberRecords = (data ?? []) as MemberRecord[]
  const cardCodeByCardNo = await loadCardCodeLookup(supabase, memberRecords)

  return memberRecords.map((record) => mapMemberRecordToMemberWithCardCode(record, cardCodeByCardNo))
}

export async function readMemberWithCardCode(
  supabase: MembersReadClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_RECORD_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read member ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const memberRecord = data as MemberRecord
  const cardCodeByCardNo = await loadCardCodeLookup(supabase, [memberRecord])

  return mapMemberRecordToMemberWithCardCode(memberRecord, cardCodeByCardNo)
}

export async function fetchMembers(): Promise<Member[]> {
  const response = await fetch('/api/members', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MembersSuccessResponse | MembersErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MembersSuccessResponse | MembersErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to load members.',
    )
  }

  return normalizeMembers({ members: responseBody.members })
}

export async function fetchMember(id: string): Promise<Member> {
  const response = await fetch(`/api/members/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberSuccessResponse | MemberErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberSuccessResponse | MemberErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to load member.',
    )
  }

  const member = normalizeMember({ member: responseBody.member })

  if (!member) {
    throw new Error('Failed to load member.')
  }

  return member
}
