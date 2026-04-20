import { z } from 'zod'
import type { PendingApprovalCounts } from '@/types'

const pendingApprovalCountsSchema = z.object({
  member_approval_requests: z.number().int().nonnegative(),
  member_edit_requests: z.number().int().nonnegative(),
  member_payment_requests: z.number().int().nonnegative(),
  member_extension_requests: z.number().int().nonnegative(),
  member_pause_requests: z.number().int().nonnegative(),
  member_pause_resume_requests: z.number().int().nonnegative(),
  class_registration_edit_requests: z.number().int().nonnegative(),
  class_registration_removal_requests: z.number().int().nonnegative(),
  pt_reschedule_requests: z.number().int().nonnegative(),
  pt_session_update_requests: z.number().int().nonnegative(),
})

type PendingApprovalCountsErrorResponse = {
  error: string
}

export function normalizePendingApprovalCounts(input: unknown): PendingApprovalCounts {
  const parsed = pendingApprovalCountsSchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Pending approval counts returned an unexpected response.')
  }

  return parsed.data
}

function getPendingApprovalCountsError(responseBody: unknown) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return (responseBody as PendingApprovalCountsErrorResponse).error
  }

  return null
}

export async function fetchPendingApprovalCounts(): Promise<PendingApprovalCounts> {
  const response = await fetch('/api/pending-approval-counts', {
    method: 'GET',
  })

  let responseBody: PendingApprovalCounts | PendingApprovalCountsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | PendingApprovalCounts
      | PendingApprovalCountsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    throw new Error(
      getPendingApprovalCountsError(responseBody) ?? 'Failed to load pending approval counts.',
    )
  }

  return normalizePendingApprovalCounts(responseBody)
}
