import { z } from 'zod'
import type { MemberPaymentMethod, MemberPaymentRequest } from '@/types'

const memberPaymentRequestSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  memberEmail: z.string().trim().nullable(),
  amount: z.number().finite(),
  paymentType: z.enum(['membership', 'card_fee']),
  paymentMethod: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
  paymentDate: z.string().trim().min(1),
  memberTypeId: z.string().trim().nullable(),
  memberTypeName: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  rejectionReason: z.string().trim().nullable(),
  status: z.enum(['pending', 'approved', 'denied']),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
})

const memberPaymentRequestsResponseSchema = z.object({
  requests: z.array(memberPaymentRequestSchema).default([]),
})

const memberPaymentRequestResponseSchema = z.object({
  request: memberPaymentRequestSchema,
})

type ErrorResponse = {
  ok?: false
  error: string
}

type MemberPaymentRequestsSuccessResponse = {
  ok: true
  requests: MemberPaymentRequest[]
}

type MemberPaymentRequestSuccessResponse = {
  ok: true
  request: MemberPaymentRequest
}

type ReviewSuccessResponse = {
  ok: true
  paymentId?: string | null
}

export type CreateMembershipPaymentRequestInput = {
  member_id: string
  payment_type: 'membership'
  amount: number
  payment_method: MemberPaymentMethod
  payment_date: string
  member_type_id?: string
  notes?: string | null
}

export type CreateCardFeePaymentRequestInput = {
  member_id: string
  payment_type: 'card_fee'
  payment_method: MemberPaymentMethod
  payment_date: string
  notes?: string | null
}

export type CreateMemberPaymentRequestInput =
  | CreateMembershipPaymentRequestInput
  | CreateCardFeePaymentRequestInput

export type ReviewMemberPaymentRequestInput = {
  action: 'approve' | 'deny'
  rejectionReason?: string | null
}

export type ReviewMemberPaymentRequestResult = {
  paymentId: string | null
}

function getErrorMessage(responseBody: unknown, fallback: string) {
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

export async function fetchMemberPaymentRequests(): Promise<MemberPaymentRequest[]> {
  const response = await fetch('/api/member-payment-requests', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberPaymentRequestsSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberPaymentRequestsSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to load member payment requests.'))
  }

  return memberPaymentRequestsResponseSchema.parse(responseBody).requests
}

export async function createMemberPaymentRequest(
  input: CreateMemberPaymentRequestInput,
): Promise<MemberPaymentRequest> {
  const response = await fetch('/api/member-payment-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: MemberPaymentRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberPaymentRequestSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to submit the member payment request.'),
    )
  }

  return memberPaymentRequestResponseSchema.parse(responseBody).request
}

export async function reviewMemberPaymentRequest(
  id: string,
  input: ReviewMemberPaymentRequestInput,
): Promise<ReviewMemberPaymentRequestResult> {
  const response = await fetch(`/api/member-payment-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: ReviewSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as ReviewSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to review the member payment request.'),
    )
  }

  const paymentId =
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'paymentId' in responseBody &&
    typeof responseBody.paymentId === 'string'
      ? responseBody.paymentId
      : null

  return {
    paymentId,
  }
}
