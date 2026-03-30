import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/unlock/route'

describe('POST /api/access/unlock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
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
})
