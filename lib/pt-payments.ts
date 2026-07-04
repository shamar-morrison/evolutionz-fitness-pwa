import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import { getDefaultMemberPaymentDate } from '@/lib/member-payments'
import { paymentMethodSchema } from '@/lib/validation-schemas'
import type { MemberPaymentMethod } from '@/types'

export type PtPaymentHistoryItem = {
  id: string
  assignmentId: string | null
  trainerName: string
  amount: number
  monthsCovered: number
  paymentMethod: MemberPaymentMethod
  notes: string | null
  paymentDate: string
  recordedBy: string
  createdAt: string
}

export type CreatePtPaymentInput = {
  memberId: string
  assignmentId?: string
  amount: number
  monthsCovered: number
  paymentMethod: MemberPaymentMethod
  notes?: string | null
  paymentDate: string
}

const ptPaymentHistoryItemSchema = z.object({
  id: z.string().trim().min(1),
  assignmentId: z.string().trim().min(1).nullable(),
  trainerName: z.string().trim().min(1),
  amount: z.number().int().positive(),
  monthsCovered: z.number().int().positive(),
  paymentMethod: paymentMethodSchema,
  notes: z.string().nullable(),
  paymentDate: z.string().trim().min(1),
  recordedBy: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
})

const ptPaymentHistoryResponseSchema = z.array(ptPaymentHistoryItemSchema)

const ptPaymentMutationResponseSchema = z.object({
  ok: z.literal(true),
  payment: z.object({
    id: z.string().trim().min(1),
    member_id: z.string().trim().min(1),
    assignment_id: z.string().trim().min(1).nullable(),
    trainer_id: z.string().trim().min(1).nullable(),
    amount: z.number().int().positive(),
    months_covered: z.number().int().positive(),
    payment_method: paymentMethodSchema,
    notes: z.string().nullable(),
    payment_date: z.string().trim().min(1),
    recorded_by: z.string().trim().min(1),
    created_at: z.string().trim().min(1),
  }),
})

const ptPaymentDeleteResponseSchema = z.object({
  ok: z.literal(true),
})

export { getDefaultMemberPaymentDate }

export async function fetchPtPayments(memberId: string): Promise<PtPaymentHistoryItem[]> {
  const searchParams = new URLSearchParams({ memberId })

  return apiFetch(
    `/api/pt/payments?${searchParams.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    ptPaymentHistoryResponseSchema,
    'Failed to load PT payments.',
  )
}

export async function recordPtPayment(input: CreatePtPaymentInput) {
  const response = await apiFetch(
    '/api/pt/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    ptPaymentMutationResponseSchema,
    'Failed to record the PT payment.',
  )

  return response.payment
}

export async function deletePtPayment(paymentId: string) {
  await apiFetch(
    `/api/pt/payments/${paymentId}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    },
    ptPaymentDeleteResponseSchema,
    'Failed to delete the PT payment.',
  )
}
