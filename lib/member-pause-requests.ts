import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
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

export type CreateMemberPauseRequestInput = {
  duration_days: number
}

export type ReviewMemberPauseRequestInput = {
  action: 'approve' | 'reject'
}

export async function fetchMemberPauseRequests(): Promise<{
  pauseRequests: MemberPauseRequest[]
  earlyResumeRequests: MemberPauseResumeRequest[]
}> {
  const responseBody = await apiFetch(
    '/api/members/pause-requests',
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberPauseRequestsResponseSchema,
    'Failed to load member pause requests.',
  )

  return {
    pauseRequests: responseBody.pauseRequests ?? [],
    earlyResumeRequests: responseBody.earlyResumeRequests ?? [],
  }
}

export async function createMemberPauseRequest(
  memberId: string,
  input: CreateMemberPauseRequestInput,
): Promise<{ id: string }> {
  return apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/pause-requests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    createMemberPauseRequestResponseSchema,
    'Failed to submit the member pause request.',
  )
}

export async function createMemberPauseResumeRequest(
  pauseId: string,
): Promise<{ id: string }> {
  return apiFetch(
    `/api/members/pauses/${encodeURIComponent(pauseId)}/resume-requests`,
    {
      method: 'POST',
    },
    createMemberPauseRequestResponseSchema,
    'Failed to submit the early resume request.',
  )
}

export async function reviewMemberPauseRequest(
  requestId: string,
  input: ReviewMemberPauseRequestInput,
): Promise<{ success: true; warning?: string }> {
  return apiFetch(
    `/api/members/pause-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberPauseRequestResponseSchema,
    'Failed to review the member pause request.',
  )
}

export async function reviewMemberPauseResumeRequest(
  requestId: string,
  input: ReviewMemberPauseRequestInput,
): Promise<{ success: true; warning?: string }> {
  return apiFetch(
    `/api/members/pause-resume-requests/${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberPauseRequestResponseSchema,
    'Failed to review the early resume request.',
  )
}

export async function pauseMemberMembership(
  memberId: string,
  input: CreateMemberPauseRequestInput,
): Promise<{ pauseId: string; warning?: string }> {
  const parsed = await apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/pause`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    pauseMemberMembershipResponseSchema,
    'Failed to pause the membership.',
  )

  return {
    pauseId: parsed.pause_id,
    warning: parsed.warning,
  }
}

export async function resumePausedMemberMembership(
  pauseId: string,
): Promise<{ newEndTime: string; warning?: string }> {
  const parsed = await apiFetch(
    `/api/members/pauses/${encodeURIComponent(pauseId)}/resume`,
    {
      method: 'POST',
    },
    resumeMemberPauseResponseSchema,
    'Failed to resume the membership pause.',
  )

  return {
    newEndTime: parsed.new_end_time,
    warning: parsed.warning,
  }
}
