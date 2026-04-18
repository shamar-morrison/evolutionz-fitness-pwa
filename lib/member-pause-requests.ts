import { z } from 'zod'
import type { MemberPauseRequest, MemberPauseResumeRequest } from '@/types'

const memberPauseRequestSchema = z.object({
  id: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  currentEndTime: z.string().trim().nullable(),
  currentStatus: z.enum(['Active', 'Expired', 'Suspended', 'Paused']).nullable(),
  durationDays: z.number().int().positive(),
  plannedResumeDate: z.string().trim().min(1),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
})

const memberPauseResumeRequestSchema = z.object({
  id: z.string().trim().min(1),
  pauseId: z.string().trim().min(1),
  memberId: z.string().trim().min(1),
  memberName: z.string().trim().min(1),
  pauseStartDate: z.string().trim().min(1),
  plannedResumeDate: z.string().trim().min(1),
  originalEndTime: z.string().trim().min(1),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedByName: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
})

const memberPauseRequestsResponseSchema = z.object({
  pauseRequests: z.array(memberPauseRequestSchema).default([]),
  earlyResumeRequests: z.array(memberPauseResumeRequestSchema).default([]),
})

const createMemberPauseRequestResponseSchema = z.object({
  id: z.string().trim().min(1),
})

const reviewMemberPauseRequestResponseSchema = z.object({
  success: z.literal(true),
  warning: z.string().trim().optional(),
})

const pauseMemberMembershipResponseSchema = z.object({
  pause_id: z.string().trim().min(1),
  warning: z.string().trim().optional(),
})

const resumeMemberPauseResponseSchema = z.object({
  new_end_time: z.string().trim().min(1),
  warning: z.string().trim().optional(),
})

type ErrorResponse = {
  ok?: false
  error: string
}

type MemberPauseRequestsSuccessResponse = {
  ok: true
  pauseRequests: MemberPauseRequest[]
  earlyResumeRequests: MemberPauseResumeRequest[]
}

type CreateMemberPauseRequestSuccessResponse = {
  ok: true
  id: string
}

type ReviewMemberPauseRequestSuccessResponse = {
  ok: true
  success: true
  warning?: string
}

type PauseMemberMembershipSuccessResponse = {
  ok: true
  pause_id: string
  warning?: string
}

type ResumeMemberPauseSuccessResponse = {
  ok: true
  new_end_time: string
  warning?: string
}

export type CreateMemberPauseRequestInput = {
  duration_days: number
}

export type ReviewMemberPauseRequestInput = {
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

export async function fetchMemberPauseRequests(): Promise<{
  pauseRequests: MemberPauseRequest[]
  earlyResumeRequests: MemberPauseResumeRequest[]
}> {
  const response = await fetch('/api/members/pause-requests', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberPauseRequestsSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberPauseRequestsSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to load member pause requests.'))
  }

  return memberPauseRequestsResponseSchema.parse(responseBody)
}

export async function createMemberPauseRequest(
  memberId: string,
  input: CreateMemberPauseRequestInput,
): Promise<{ id: string }> {
  const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/pause-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: CreateMemberPauseRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | CreateMemberPauseRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to submit the member pause request.'))
  }

  return createMemberPauseRequestResponseSchema.parse(responseBody)
}

export async function createMemberPauseResumeRequest(
  pauseId: string,
): Promise<{ id: string }> {
  const response = await fetch(
    `/api/members/pauses/${encodeURIComponent(pauseId)}/resume-requests`,
    {
      method: 'POST',
    },
  )

  let responseBody: CreateMemberPauseRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | CreateMemberPauseRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to submit the early resume request.'),
    )
  }

  return createMemberPauseRequestResponseSchema.parse(responseBody)
}

export async function reviewMemberPauseRequest(
  requestId: string,
  input: ReviewMemberPauseRequestInput,
): Promise<{ success: true; warning?: string }> {
  const response = await fetch(`/api/members/pause-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: ReviewMemberPauseRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ReviewMemberPauseRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to review the member pause request.'))
  }

  return reviewMemberPauseRequestResponseSchema.parse(responseBody)
}

export async function reviewMemberPauseResumeRequest(
  requestId: string,
  input: ReviewMemberPauseRequestInput,
): Promise<{ success: true; warning?: string }> {
  const response = await fetch(
    `/api/members/pause-resume-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  let responseBody: ReviewMemberPauseRequestSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ReviewMemberPauseRequestSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      getErrorMessage(responseBody, 'Failed to review the early resume request.'),
    )
  }

  return reviewMemberPauseRequestResponseSchema.parse(responseBody)
}

export async function pauseMemberMembership(
  memberId: string,
  input: CreateMemberPauseRequestInput,
): Promise<{ pauseId: string; warning?: string }> {
  const response = await fetch(`/api/members/${encodeURIComponent(memberId)}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: PauseMemberMembershipSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | PauseMemberMembershipSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to pause the membership.'))
  }

  const parsed = pauseMemberMembershipResponseSchema.parse(responseBody)

  return {
    pauseId: parsed.pause_id,
    warning: parsed.warning,
  }
}

export async function resumePausedMemberMembership(
  pauseId: string,
): Promise<{ newEndTime: string; warning?: string }> {
  const response = await fetch(`/api/members/pauses/${encodeURIComponent(pauseId)}/resume`, {
    method: 'POST',
  })

  let responseBody: ResumeMemberPauseSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ResumeMemberPauseSuccessResponse
      | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getErrorMessage(responseBody, 'Failed to resume the membership pause.'))
  }

  const parsed = resumeMemberPauseResponseSchema.parse(responseBody)

  return {
    newEndTime: parsed.new_end_time,
    warning: parsed.warning,
  }
}
