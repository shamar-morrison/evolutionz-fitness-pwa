import { z } from 'zod'
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

type ErrorResponse = {
  ok?: false
  error: string
}

type MemberExtensionRequestsSuccessResponse = {
  ok: true
  requests: MemberExtensionRequest[]
}

type CreateMemberExtensionRequestSuccessResponse = {
  ok: true
  id: string
}

type ReviewMemberExtensionRequestSuccessResponse = {
  ok: true
  success: true
  warning?: string
}

type ExtendMemberMembershipSuccessResponse = {
  ok: true
  new_end_time: string
  warning?: string
}

export type CreateMemberExtensionRequestInput = {
  duration_days: number
}

export type ReviewMemberExtensionRequestInput = {
  action: 'approve' | 'reject'
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

export async function fetchMemberExtensionRequests(): Promise<MemberExtensionRequest[]> {
  const response = await fetch('/api/members/extension-requests', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberExtensionRequestsSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberExtensionRequestsSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to load member extension requests.'))
  }

  return memberExtensionRequestsResponseSchema.parse(responseBody).requests
}

export async function createMemberExtensionRequest(
  memberId: string,
  input: CreateMemberExtensionRequestInput,
): Promise<{ id: string }> {
  const response = await fetch(
    `/api/members/${encodeURIComponent(memberId)}/extension-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  let responseBody: CreateMemberExtensionRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | CreateMemberExtensionRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to submit the member extension request.'),
    )
  }

  return createMemberExtensionRequestResponseSchema.parse(responseBody)
}

export async function reviewMemberExtensionRequest(
  requestId: string,
  input: ReviewMemberExtensionRequestInput,
): Promise<{ success: true; warning?: string }> {
  const response = await fetch(
    `/api/members/extension-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  let responseBody: ReviewMemberExtensionRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ReviewMemberExtensionRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to review the member extension request.'),
    )
  }

  return reviewMemberExtensionRequestResponseSchema.parse(responseBody)
}

export async function extendMemberMembership(
  memberId: string,
  input: CreateMemberExtensionRequestInput,
): Promise<{ newEndTime: string; warning?: string }> {
  const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/extend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: ExtendMemberMembershipSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ExtendMemberMembershipSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to extend the membership.'))
  }

  const parsed = extendMemberMembershipResponseSchema.parse(responseBody)

  return {
    newEndTime: parsed.new_end_time,
    warning: parsed.warning,
  }
}
