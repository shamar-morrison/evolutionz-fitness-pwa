import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/pending-approval-counts/route'

const pendingApprovalCountsPayload = {
  member_approval_requests: 3,
  member_edit_requests: 2,
  member_payment_requests: 4,
  member_extension_requests: 6,
  member_pause_requests: 7,
  member_pause_resume_requests: 1,
  pt_reschedule_requests: 11,
  pt_session_update_requests: 5,
}

function createPendingApprovalCountsAdminClient({
  payload = pendingApprovalCountsPayload,
  error = null,
}: {
  payload?: unknown
  error?: { message: string } | null
} = {}) {
  const singleMock = vi.fn().mockResolvedValue({
    data: payload,
    error,
  })
  const rpcMock = vi.fn().mockReturnValue({
    single: singleMock,
  })

  return {
    rpc: rpcMock,
    singleMock,
  }
}

describe('GET /api/pending-approval-counts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the rpc counts object for admins', async () => {
    const supabase = createPendingApprovalCountsAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('get_pending_approval_counts')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(pendingApprovalCountsPayload)
  })

  it('returns the auth failure response when the admin check fails', async () => {
    mockUnauthorized()

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when the pending approval counts rpc fails', async () => {
    const supabase = createPendingApprovalCountsAdminClient({
      error: { message: 'rpc exploded' },
    })
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load pending approval counts: rpc exploded',
    })
  })
})
