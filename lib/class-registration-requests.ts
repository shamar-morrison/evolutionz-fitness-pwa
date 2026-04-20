import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type {
  ClassRegistrationEditRequest,
  ClassRegistrationRemovalRequest,
} from '@/types'
import type { UpdateClassRegistrationInput } from '@/lib/classes'

const classRegistrationEditRequestSchema = z.object({
  id: z.string().trim().min(1),
  registrationId: z.string().trim().min(1),
  classId: z.string().trim().min(1),
  className: z.string().trim().min(1),
  memberId: z.string().trim().nullable(),
  guestProfileId: z.string().trim().nullable(),
  registrantName: z.string().trim().min(1),
  registrantEmail: z.string().trim().nullable(),
  currentFeeType: z.enum(['monthly', 'per_session', 'custom']).nullable(),
  currentAmountPaid: z.number().finite(),
  currentPeriodStart: z.string().trim().min(1),
  currentPaymentReceived: z.boolean(),
  currentNotes: z.string().trim().nullable(),
  proposedFeeType: z.enum(['monthly', 'per_session', 'custom']).nullable(),
  proposedAmountPaid: z.number().finite(),
  proposedPeriodStart: z.string().trim().min(1),
  proposedPaymentReceived: z.boolean(),
  proposedNotes: z.string().trim().nullable(),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string().trim().min(1),
})

const classRegistrationRemovalRequestSchema = z.object({
  id: z.string().trim().min(1),
  registrationId: z.string().trim().min(1),
  classId: z.string().trim().min(1),
  className: z.string().trim().min(1),
  memberId: z.string().trim().nullable(),
  guestProfileId: z.string().trim().nullable(),
  registrantName: z.string().trim().min(1),
  registrantEmail: z.string().trim().nullable(),
  amountPaidAtRequest: z.number().finite(),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.string().trim().min(1),
})

const classRegistrationRequestsResponseSchema = z.object({
  ok: z.literal(true),
  editRequests: z.array(classRegistrationEditRequestSchema).default([]),
  removalRequests: z.array(classRegistrationRemovalRequestSchema).default([]),
})

const createClassRegistrationRequestResponseSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().trim().min(1),
})

const reviewClassRegistrationEditRequestResponseSchema = z.object({
  ok: z.literal(true),
  registration: z
    .object({
      amount_paid: z.number().finite(),
    })
    .passthrough()
    .optional(),
  amountChanged: z.boolean().optional(),
})

const reviewClassRegistrationRemovalRequestResponseSchema = z.object({
  ok: z.literal(true),
  classId: z.string().trim().optional(),
  amountPaid: z.number().finite().optional(),
})

const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})

export type ClassRegistrationRequestsResponse = {
  editRequests: ClassRegistrationEditRequest[]
  removalRequests: ClassRegistrationRemovalRequest[]
}

export async function fetchClassRegistrationRequests(): Promise<ClassRegistrationRequestsResponse> {
  const response = await apiFetch(
    '/api/classes/registration-requests',
    {
      method: 'GET',
      cache: 'no-store',
    },
    classRegistrationRequestsResponseSchema,
    'Failed to load class registration requests.',
  )

  return {
    editRequests: response.editRequests,
    removalRequests: response.removalRequests,
  }
}

export async function createClassRegistrationEditRequest(
  registrationId: string,
  input: UpdateClassRegistrationInput,
) {
  return apiFetch(
    `/api/classes/registrations/${encodeURIComponent(registrationId)}/edit-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    createClassRegistrationRequestResponseSchema,
    'Failed to create the class registration edit request.',
  )
}

export async function createClassRegistrationRemovalRequest(registrationId: string) {
  return apiFetch(
    `/api/classes/registrations/${encodeURIComponent(registrationId)}/removal-requests`,
    {
      method: 'POST',
    },
    createClassRegistrationRequestResponseSchema,
    'Failed to create the class registration removal request.',
  )
}

export async function reviewClassRegistrationEditRequest(
  requestId: string,
  action: 'approve' | 'reject',
) {
  reviewActionSchema.parse({ action })

  return apiFetch(
    `/api/classes/registration-edit-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    },
    reviewClassRegistrationEditRequestResponseSchema,
    'Failed to review the class registration edit request.',
  )
}

export async function reviewClassRegistrationRemovalRequest(
  requestId: string,
  action: 'approve' | 'reject',
) {
  reviewActionSchema.parse({ action })

  return apiFetch(
    `/api/classes/registration-removal-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    },
    reviewClassRegistrationRemovalRequestResponseSchema,
    'Failed to review the class registration removal request.',
  )
}
