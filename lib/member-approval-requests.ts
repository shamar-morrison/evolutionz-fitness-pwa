import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { MemberApprovalRequest, MemberApprovalRequestStatus, MemberGender } from '@/types'

const memberApprovalRequestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  gender: z.enum(['Male', 'Female']).nullable(),
  email: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  remark: z.string().trim().nullable(),
  joinedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  beginTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  cardNo: z.string().trim().min(1),
  cardCode: z.string().trim().min(1),
  memberTypeId: z.string().trim().min(1),
  memberTypeName: z.string().trim().min(1),
  photoUrl: z.string().trim().nullable(),
  status: z.enum(['pending', 'approved', 'denied']),
  submittedBy: z.string().trim().min(1),
  submittedByName: z.string().trim().nullable(),
  reviewedBy: z.string().trim().nullable(),
  reviewedAt: z.string().trim().nullable(),
  reviewNote: z.string().trim().nullable(),
  memberId: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
})

const memberApprovalRequestsResponseSchema = z.object({
  requests: z.array(memberApprovalRequestSchema).default([]),
})

const memberApprovalRequestResponseSchema = z.object({
  request: memberApprovalRequestSchema,
})

const reviewMemberApprovalRequestResponseSchema = z.object({
  request: memberApprovalRequestSchema.optional(),
  warning: z.string().trim().optional(),
})

export type CreateMemberApprovalRequestInput = {
  name: string
  gender: MemberGender
  email: string
  phone: string
  remark?: string | null
  joined_at?: string | null
  beginTime: string
  endTime: string
  cardNo: string
  cardCode: string
  member_type_id: string
}

export type ReviewMemberApprovalRequestInput =
  | {
      status: 'denied'
      review_note?: string | null
    }
  | {
      status: 'approved'
      selected_card_no: string
      review_note?: string | null
    }

export async function fetchMemberApprovalRequests(
  status: MemberApprovalRequestStatus = 'pending',
): Promise<MemberApprovalRequest[]> {
  const searchParams = new URLSearchParams({ status })
  const responseBody = await apiFetch(
    `/api/member-approval-requests?${searchParams.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberApprovalRequestsResponseSchema,
    'Failed to load member approval requests.',
  )

  return (responseBody.requests ?? []) as MemberApprovalRequest[]
}

export async function createMemberApprovalRequest(
  input: CreateMemberApprovalRequestInput,
): Promise<MemberApprovalRequest> {
  const responseBody = await apiFetch(
    '/api/member-approval-requests',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    memberApprovalRequestResponseSchema,
    'Failed to submit the member request.',
  )

  return responseBody.request as MemberApprovalRequest
}

export async function reviewMemberApprovalRequest(
  id: string,
  input: ReviewMemberApprovalRequestInput,
): Promise<{
  request?: MemberApprovalRequest
  warning?: string
}> {
  return apiFetch(
    `/api/member-approval-requests/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    reviewMemberApprovalRequestResponseSchema,
    'Failed to review the member request.',
  ) as Promise<{
    request?: MemberApprovalRequest
    warning?: string
  }>
}

export async function uploadMemberApprovalRequestPhoto(
  requestId: string,
  photo: Blob,
): Promise<MemberApprovalRequest> {
  const formData = new FormData()
  formData.append('photo', photo, `${requestId}.jpg`)

  const responseBody = await apiFetch(
    `/api/member-approval-requests/${encodeURIComponent(requestId)}/photo`,
    {
      method: 'POST',
      body: formData,
    },
    memberApprovalRequestResponseSchema,
    'Failed to upload the request photo.',
  )

  return responseBody.request as MemberApprovalRequest
}
