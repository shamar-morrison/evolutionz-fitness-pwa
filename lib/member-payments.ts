import { z } from 'zod'
import { getJamaicaDateInputValue } from '@/lib/member-access-time'
import type {
  MemberPayment,
  MemberPaymentHistoryResponse,
  MemberPaymentMethod,
  MemberTypeRecord,
} from '@/types'

export const MEMBER_PAYMENT_METHOD_OPTIONS: Array<{
  label: string
  value: MemberPaymentMethod
}> = [
  { label: 'Cash', value: 'cash' },
  { label: 'Fygaro', value: 'fygaro' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Point of Sale', value: 'point_of_sale' },
]

export const MEMBER_PAYMENTS_PAGE_SIZE = 10

const memberPaymentSchema = z.object({
  id: z.string().trim().min(1),
  member_id: z.string().trim().min(1),
  member_type_id: z.string().trim().min(1),
  payment_method: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
  amount_paid: z.number().finite(),
  promotion: z.string().trim().nullable(),
  recorded_by: z.string().trim().nullable(),
  payment_date: z.string().trim().min(1),
  notes: z.string().trim().nullable(),
  created_at: z.string().trim().min(1),
})

const memberPaymentResponseSchema = z.object({
  payment: memberPaymentSchema,
})

const memberPaymentHistoryItemSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberTypeId: z.string().trim().min(1),
  memberTypeName: z.string().trim().nullable(),
  paymentMethod: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
  amountPaid: z.number().finite(),
  promotion: z.string().trim().nullable(),
  recordedBy: z.string().trim().nullable(),
  recordedByName: z.string().trim().nullable(),
  paymentDate: z.string().trim().min(1),
  notes: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
})

const memberPaymentHistoryResponseSchema = z.object({
  payments: z.array(memberPaymentHistoryItemSchema),
  totalMatches: z.number().int().nonnegative(),
})

type MemberPaymentSuccessResponse = {
  ok: true
  payment: MemberPayment
}

type ErrorResponse = {
  ok?: false
  error: string
}

export type CreateMemberPaymentInput = {
  member_type_id: string
  payment_method: MemberPaymentMethod
  amount_paid: number
  promotion?: string | null
  payment_date: string
  notes?: string | null
}

export function getMemberTypeMonthlyRate(
  memberTypes: MemberTypeRecord[],
  memberTypeId: string,
) {
  const match = memberTypes.find((memberType) => memberType.id === memberTypeId)
  return typeof match?.monthly_rate === 'number' ? match.monthly_rate : null
}

export function formatPaymentAmountInputValue(amount: number) {
  return Number.isFinite(amount) ? String(amount) : ''
}

export function getDefaultMemberPaymentDate(now: Date = new Date()) {
  return getJamaicaDateInputValue(now)
}

export async function fetchMemberPayments(
  memberId: string,
  page: number,
  limit = MEMBER_PAYMENTS_PAGE_SIZE,
): Promise<MemberPaymentHistoryResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  const response = await fetch(
    `/api/members/${encodeURIComponent(memberId)}/payments?${searchParams.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )

  let responseBody: MemberPaymentHistoryResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberPaymentHistoryResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('error' in responseBody && responseBody.error)) {
    throw new Error(
      responseBody && 'error' in responseBody
        ? responseBody.error
        : 'Failed to load member payments.',
    )
  }

  return memberPaymentHistoryResponseSchema.parse(responseBody)
}

export async function deleteMemberPayment(
  memberId: string,
  paymentId: string,
): Promise<void> {
  const response = await fetch(
    `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'DELETE',
    },
  )

  let responseBody: { ok: true } | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as { ok: true } | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('error' in responseBody && responseBody.error)) {
    throw new Error(
      responseBody && 'error' in responseBody
        ? responseBody.error
        : 'Failed to delete the member payment.',
    )
  }
}

export async function recordMemberPayment(
  memberId: string,
  input: CreateMemberPaymentInput,
): Promise<MemberPayment> {
  const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: MemberPaymentSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberPaymentSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && 'error' in responseBody
        ? responseBody.error
        : 'Failed to record the member payment.',
    )
  }

  return memberPaymentResponseSchema.parse(responseBody).payment
}
