import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import { paymentMethodSchema } from '@/lib/validation-schemas'
import type { MemberPaymentMethod, MemberPaymentRequest } from '@/types'

const memberPaymentRequestSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  memberEmail: z.string().trim().nullable(),
  amount: z.number().finite(),
  paymentType: z.enum(['membership', 'card_fee']),
  paymentMethod: paymentMethodSchema,
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

const reviewMemberPaymentRequestResponseSchema = z.object({
  paymentId: z.string().trim().min(1).nullable().optional(),
})

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
  amount: number
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

export async function fetchMemberPaymentRequests(): Promise<MemberPaymentRequest[]> {
  const responseBody = await apiFetch(
    '/api/member-payment-requests',
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberPaymentRequestsResponseSchema,
    'Failed to load member payment requests.',
  )

  return responseBody.requests
}

export async function createMemberPaymentRequest(
  input: CreateMemberPaymentRequestInput,
): Promise<MemberPaymentRequest> {
  const responseBody = await apiFetch(
    '/api/member-payment-requests',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    memberPaymentRequestResponseSchema,
    'Failed to submit the member payment request.',
  )

  return responseBody.request
}

export async function reviewMemberPaymentRequest(
  id: string,
  input: ReviewMemberPaymentRequestInput,
): Promise<ReviewMemberPaymentRequestResult> {
  const responseBody = await apiFetch(
    `/api/member-payment-requests/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberPaymentRequestResponseSchema,
    'Failed to review the member payment request.',
  )

  return {
    paymentId: responseBody.paymentId ?? null,
  }
}
