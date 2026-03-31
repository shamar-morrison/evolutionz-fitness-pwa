import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/hik/sync-members/route'

describe('POST /api/hik/sync-members', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues sync_all_members and returns the summary', async () => {
    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              membersImported: 8,
              cardsImported: 12,
              placeholderSlotsSkipped: 3,
            },
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
        type: 'sync_all_members',
        payload: {},
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: {
        membersImported: 8,
        cardsImported: 12,
        placeholderSlotsSkipped: 3,
      },
    })
  })

  it('returns 502 when sync_all_members fails', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Bridge sync failed.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Bridge sync failed.',
    })
  })

  it('returns 504 when sync_all_members times out', async () => {
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

    const responsePromise = POST()

    await vi.advanceTimersByTimeAsync(62_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Sync members request timed out after 60 seconds.',
    })
  })
})
