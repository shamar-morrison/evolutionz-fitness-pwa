import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
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

export type UpdateMemberTypeRateInput = {
  monthly_rate: number
}

export function formatMemberTypeRate(monthlyRate: number) {
  return `JMD ${formatJmdCurrency(monthlyRate)}`
}

export async function fetchMemberTypes(): Promise<MemberTypeRecord[]> {
  const responseBody = await apiFetch(
    '/api/settings/member-types',
    {
      method: 'GET',
    },
    memberTypesResponseSchema,
    'Failed to load membership types.',
  )

  return responseBody.memberTypes ?? []
}

export async function updateMemberTypeRate(
  id: string,
  input: UpdateMemberTypeRateInput,
): Promise<MemberTypeRecord> {
  const responseBody = await apiFetch(
    `/api/settings/member-types/${id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    memberTypeResponseSchema,
    'Failed to update the membership type rate.',
  )

  return responseBody.memberType
}
