import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/slots/assign/route'

describe('POST /api/access/slots/assign', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues add_user using the selected slot employee number', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16.000Z'))

    const { client, insertedJobs } = createFakeAccessControlClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/slots/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          cardNo: '0102857149',
          placeholderName: 'P42',
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
          employeeNo: '00000611',
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

  it('returns 502 when slot assignment fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Device rejected slot update.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/slots/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          cardNo: '0102857149',
          placeholderName: 'P42',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Device rejected slot update.',
    })
  })

  it('returns 504 when slot assignment times out', async () => {
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
      new Request('http://localhost/api/access/slots/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          cardNo: '0102857149',
          placeholderName: 'P42',
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
      error: 'Assign slot request timed out after 10 seconds.',
    })
  })

  it('returns 500 when slot assignment polling fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: null,
          error: { message: 'select exploded' },
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/slots/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          cardNo: '0102857149',
          placeholderName: 'P42',
          name: 'Jane Doe',
          expiry: '2026-07-15',
        }),
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read assign slot job job-123: select exploded',
    })
  })
})
