import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPendingApprovalCounts,
  normalizePendingApprovalCounts,
} from '@/lib/pending-approval-counts'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

const pendingApprovalCountsPayload = {
  member_approval_requests: 3,
  member_edit_requests: 2,
  member_payment_requests: 4,
  member_extension_requests: 6,
  member_pause_requests: 7,
  member_pause_resume_requests: 1,
  class_registration_edit_requests: 5,
  class_registration_removal_requests: 2,
  pt_reschedule_requests: 11,
  pt_session_update_requests: 5,
}

describe('pending approval counts helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes pending approval counts responses', () => {
    expect(normalizePendingApprovalCounts(pendingApprovalCountsPayload)).toEqual(
      pendingApprovalCountsPayload,
    )
  })

  it('fetches pending approval counts from the counts route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(pendingApprovalCountsPayload, 200))

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPendingApprovalCounts()).resolves.toEqual(pendingApprovalCountsPayload)
    expect(fetchMock).toHaveBeenCalledWith('/api/pending-approval-counts', {
      method: 'GET',
    })
  })

  it('throws the route error when fetching pending approval counts fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'Failed to load pending approval counts: rpc exploded',
        },
        500,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPendingApprovalCounts()).rejects.toThrow(
      'Failed to load pending approval counts: rpc exploded',
    )
  })
})
