import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET } from '@/app/api/access/slots/available/route'

describe('GET /api/access/slots/available', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues list_available_slots and returns normalized slots', async () => {
    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              slots: [
                { employeeNo: '00000612', cardNo: '0104620061', placeholderName: 'P43' },
                { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
                { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
              ],
              diagnostics: {
                matchedJoinedSlots: 2,
              },
            },
            error: null,
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'list_available_slots',
        payload: {},
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slots: [
        { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
        { employeeNo: '00000612', cardNo: '0104620061', placeholderName: 'P43' },
      ],
    })
  })

  it('returns 502 when list_available_slots fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Slot search failed.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Slot search failed.',
    })
  })

  it('returns 504 when list_available_slots times out', async () => {
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

    const responsePromise = GET()
    let resolvedResponse: Response | null = null

    responsePromise.then((response) => {
      resolvedResponse = response
    })

    await vi.advanceTimersByTimeAsync(10_500)
    expect(resolvedResponse).toBeNull()

    await vi.advanceTimersByTimeAsync(60_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Fetch available slots request timed out after 60 seconds.',
    })
  })

  it('returns 500 when list_available_slots polling fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: null,
          error: { message: 'select exploded' },
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read list available slots job job-123: select exploded',
    })
  })
})
