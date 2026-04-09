import { z } from 'zod'
import { formatJmdCurrency } from '@/lib/pt-scheduling'
import type { MemberTypeRecord } from '@/types'

const memberTypeRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  monthly_rate: z.number().finite(),
  is_active: z.boolean(),
  created_at: z.string().trim().min(1),
})

const memberTypesResponseSchema = z.object({
  memberTypes: z.array(memberTypeRecordSchema).default([]),
})

const memberTypeResponseSchema = z.object({
  memberType: memberTypeRecordSchema,
})

type MemberTypesSuccessResponse = {
  ok: true
  memberTypes: MemberTypeRecord[]
}

type MemberTypeSuccessResponse = {
  ok: true
  memberType: MemberTypeRecord
}

type ErrorResponse = {
  ok?: false
  error: string
}

export type UpdateMemberTypeRateInput = {
  monthly_rate: number
}

export function formatMemberTypeRate(monthlyRate: number) {
  return `JMD ${formatJmdCurrency(monthlyRate)}`
}

function getResponseErrorMessage(responseBody: unknown, fallback: string) {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return responseBody.error
  }

  return fallback
}

export async function fetchMemberTypes(): Promise<MemberTypeRecord[]> {
  const response = await fetch('/api/settings/member-types', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberTypesSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberTypesSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getResponseErrorMessage(responseBody, 'Failed to load membership types.'))
  }

  return memberTypesResponseSchema.parse(responseBody).memberTypes
}

export async function updateMemberTypeRate(
  id: string,
  input: UpdateMemberTypeRateInput,
): Promise<MemberTypeRecord> {
  const response = await fetch(`/api/settings/member-types/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: MemberTypeSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberTypeSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getResponseErrorMessage(responseBody, 'Failed to update the membership type rate.'),
    )
  }

  return memberTypeResponseSchema.parse(responseBody).memberType
}
