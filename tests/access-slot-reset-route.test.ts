import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/slots/reset/route'

describe('POST /api/access/slots/reset', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues reset_slot with the selected placeholder record', async () => {
    const { client, insertedJobs } = createFakeAccessControlClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/slots/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          placeholderName: 'P42',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'reset_slot',
        payload: {
          employeeNo: '00000611',
          placeholderName: 'P42',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      jobId: 'job-123',
      result: { accepted: true },
    })
  })

  it('returns 502 when slot reset fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Reset failed.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/slots/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          placeholderName: 'P42',
        }),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Reset failed.',
    })
  })

  it('returns 504 when slot reset times out', async () => {
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
      new Request('http://localhost/api/access/slots/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          placeholderName: 'P42',
        }),
      }),
    )

    await vi.advanceTimersByTimeAsync(10_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Reset slot request timed out after 10 seconds.',
    })
  })

  it('returns 500 when slot reset polling fails', async () => {
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
      new Request('http://localhost/api/access/slots/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '00000611',
          placeholderName: 'P42',
        }),
      }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read reset slot job job-123: select exploded',
    })
  })
})
