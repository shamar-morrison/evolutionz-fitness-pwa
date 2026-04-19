import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { MemberEditRequest, MemberGender } from '@/types'

const memberEditRequestSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  currentName: z.string().trim().min(1),
  currentGender: z.enum(['Male', 'Female']).nullable(),
  currentPhone: z.string().trim().nullable(),
  currentEmail: z.string().trim().nullable(),
  currentMemberTypeId: z.string().trim().nullable(),
  currentMemberTypeName: z.string().trim().nullable(),
  currentJoinDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  currentBeginTime: z.string().trim().nullable(),
  currentEndTime: z.string().trim().nullable(),
  proposedName: z.string().trim().nullable(),
  proposedGender: z.enum(['Male', 'Female']).nullable(),
  proposedPhone: z.string().trim().nullable(),
  proposedEmail: z.string().trim().nullable(),
  proposedMemberTypeId: z.string().trim().nullable(),
  proposedMemberTypeName: z.string().trim().nullable(),
  proposedJoinDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  proposedStartDate: z.string().trim().nullable(),
  proposedStartTime: z.string().trim().nullable(),
  proposedDuration: z.string().trim().nullable(),
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

const memberEditRequestsResponseSchema = z.object({
  requests: z.array(memberEditRequestSchema).default([]),
})

const memberEditRequestResponseSchema = z.object({
  request: memberEditRequestSchema,
})

const reviewMemberEditRequestResponseSchema = z.object({
  ok: z.literal(true),
})

export type CreateMemberEditRequestInput = {
  member_id: string
  proposed_name?: string
  proposed_gender?: MemberGender
  proposed_phone?: string
  proposed_email?: string
  proposed_member_type_id?: string
  proposed_join_date?: string
  proposed_start_date?: string
  proposed_start_time?: string
  proposed_duration?: string
}

export type ReviewMemberEditRequestInput = {
  action: 'approve' | 'deny'
  rejectionReason?: string | null
}

export async function fetchMemberEditRequests(): Promise<MemberEditRequest[]> {
  const responseBody = await apiFetch(
    '/api/member-edit-requests',
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberEditRequestsResponseSchema,
    'Failed to load member edit requests.',
  )

  return (responseBody.requests ?? []) as MemberEditRequest[]
}

export async function createMemberEditRequest(
  input: CreateMemberEditRequestInput,
): Promise<MemberEditRequest> {
  const responseBody = await apiFetch(
    '/api/member-edit-requests',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    memberEditRequestResponseSchema,
    'Failed to submit the member edit request.',
  )

  return responseBody.request as MemberEditRequest
}

export async function reviewMemberEditRequest(
  id: string,
  input: ReviewMemberEditRequestInput,
): Promise<void> {
  await apiFetch(
    `/api/member-edit-requests/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberEditRequestResponseSchema,
    'Failed to review the member edit request.',
  )
}
