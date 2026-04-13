import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMemberPayment,
  fetchMemberPayments,
  MEMBER_PAYMENTS_PAGE_SIZE,
} from '@/lib/member-payments'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('member payment helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches member payments using page and limit query params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          payments: [],
          totalMatches: 0,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMemberPayments('member-1', 2)).resolves.toEqual({
      payments: [],
      totalMatches: 0,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/members/member-1/payments?page=2&limit=${MEMBER_PAYMENTS_PAGE_SIZE}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    )
  })

  it('throws when fetching member payments returns a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'bad',
        },
        400,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMemberPayments('member-1', 2)).rejects.toThrow('bad')
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/members/member-1/payments?page=2&limit=${MEMBER_PAYMENTS_PAGE_SIZE}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    )
  })

  it('deletes a specific member payment row', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteMemberPayment('member-1', 'payment-1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/members/member-1/payments/payment-1', {
      method: 'DELETE',
    })
  })

  it('throws when deleting a member payment returns a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'bad',
        },
        400,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteMemberPayment('member-1', 'payment-1')).rejects.toThrow('bad')
    expect(fetchMock).toHaveBeenCalledWith('/api/members/member-1/payments/payment-1', {
      method: 'DELETE',
    })
  })
})
