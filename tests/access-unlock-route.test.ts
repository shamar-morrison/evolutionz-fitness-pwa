import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'
import {
  mockAuthenticatedProfile,
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
    requireAuthenticatedProfile: mod.requireAuthenticatedProfileMock,
  }
})

import { POST } from '@/app/api/access/unlock/route'

describe('POST /api/access/unlock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('still queues unlock_door and returns the worker result', async () => {
    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-999',
            status: 'done',
            result: { unlocked: true },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedProfile({
      profile: {
        id: 'assistant-1',
        role: 'staff',
        titles: ['Assistant'],
      },
    })

    const response = await POST()

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'unlock_door',
        payload: { doorNo: 1 },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      jobId: 'job-123',
      result: { unlocked: true },
    })
  })

  it('returns 403 for authenticated staff without door permissions', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: 'trainer-1',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await POST()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })
})
