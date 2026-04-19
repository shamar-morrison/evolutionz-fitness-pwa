import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { MemberExtensionRequest } from '@/types'

const memberExtensionRequestSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  currentEndTime: z.string().trim().nullable(),
  currentStatus: z.enum(['Active', 'Expired', 'Suspended', 'Paused']).nullable(),
  durationDays: z.number().int().positive(),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
})

const memberExtensionRequestsResponseSchema = z.object({
  requests: z.array(memberExtensionRequestSchema).default([]),
})

const createMemberExtensionRequestResponseSchema = z.object({
  id: z.string().trim().min(1),
})

const reviewMemberExtensionRequestResponseSchema = z.object({
  success: z.literal(true),
  warning: z.string().trim().optional(),
})

const extendMemberMembershipResponseSchema = z.object({
  new_end_time: z.string().trim().min(1),
  warning: z.string().trim().optional(),
})

export type CreateMemberExtensionRequestInput = {
  duration_days: number
}

export type ReviewMemberExtensionRequestInput = {
  action: 'approve' | 'reject'
}

export async function fetchMemberExtensionRequests(): Promise<MemberExtensionRequest[]> {
  const responseBody = await apiFetch(
    '/api/members/extension-requests',
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberExtensionRequestsResponseSchema,
    'Failed to load member extension requests.',
  )

  return responseBody.requests ?? []
}

export async function createMemberExtensionRequest(
  memberId: string,
  input: CreateMemberExtensionRequestInput,
): Promise<{ id: string }> {
  return apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/extension-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    createMemberExtensionRequestResponseSchema,
    'Failed to submit the member extension request.',
  )
}

export async function reviewMemberExtensionRequest(
  requestId: string,
  input: ReviewMemberExtensionRequestInput,
): Promise<{ success: true; warning?: string }> {
  return apiFetch(
    `/api/members/extension-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberExtensionRequestResponseSchema,
    'Failed to review the member extension request.',
  )
}

export async function extendMemberMembership(
  memberId: string,
  input: CreateMemberExtensionRequestInput,
): Promise<{ newEndTime: string; warning?: string }> {
  const parsed = await apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/extend`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    extendMemberMembershipResponseSchema,
    'Failed to extend the membership.',
  )

  return {
    newEndTime: parsed.new_end_time,
    warning: parsed.warning,
  }
}
