import { z } from 'zod'
import type { Member, MemberRecord } from '@/types'

const memberSchema = z.object({
  id: z.string().trim().min(1, 'Member id is required.'),
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  cardNo: z.string(),
  slotPlaceholderName: z.string().trim().min(1).optional(),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  status: z.enum(['Active', 'Expired', 'Suspended']),
  deviceAccessState: z.enum(['ready', 'released']),
  expiry: z.string().trim().min(1).nullable(),
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

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
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
  const employeeNo = normalizeText(record.employee_no)
  const createdAt = normalizeTimestamp(record.created_at)

  return {
    id: normalizeText(record.id),
    employeeNo,
    name: normalizeText(record.name) || employeeNo,
    cardNo: normalizeText(record.card_no),
    type: record.type,
    status: record.status,
    deviceAccessState: 'ready',
    expiry: normalizeTimestamp(record.expiry),
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
