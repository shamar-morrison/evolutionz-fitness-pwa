import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'
import { resetServerAuthMocks } from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { POST } from '@/app/api/access/members/user/route'

describe('POST /api/access/members/user', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('queues add_user with the bridge-native payload', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16.000Z'))

    const { client, insertedJobs } = createFakeAccessControlClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: 'Jane Doe',
          userType: 'normal',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-07-15T23:59:59',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      jobId: 'job-123',
      result: { accepted: true },
    })
  })

  it('returns 502 when add_user fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Device rejected request.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Device rejected request.',
    })
  })

  it('returns 504 when add_user times out', async () => {
    vi.useFakeTimers()

    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'pending',
            result: null,
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST(
      new Request('http://localhost/api/access/members/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    await vi.advanceTimersByTimeAsync(10_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Create member request timed out after 10 seconds.',
    })
  })

  it('returns 500 when add_user job creation fails', async () => {
    const { client } = createFakeAccessControlClient({
      insertResult: {
        data: null,
        error: { message: 'insert exploded' },
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to create add user job: insert exploded',
    })
  })
})
