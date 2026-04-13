import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_PAYMENTS_PAGE_SIZE } from '@/lib/member-payments'

const { fetchMemberPaymentsMock, useQueryMock } = vi.hoisted(() => ({
  fetchMemberPaymentsMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('@/lib/member-payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-payments')>(
    '@/lib/member-payments',
  )

  return {
    ...actual,
    fetchMemberPayments: fetchMemberPaymentsMock,
  }
})

import { useMemberPayments } from '@/hooks/use-member-payments'

describe('useMemberPayments', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('enables the query for zero-based pages', async () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      error: null,
    })

    useMemberPayments('member-1', 0)

    const queryOptions = useQueryMock.mock.calls[0]?.[0]

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        staleTime: 24 * 60 * 60 * 1000,
      }),
    )

    await queryOptions.queryFn()

    expect(fetchMemberPaymentsMock).toHaveBeenCalledWith(
      'member-1',
      0,
      MEMBER_PAYMENTS_PAGE_SIZE,
    )
  })

  it('disables the query for invalid page values', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      error: null,
    })

    useMemberPayments('member-1', -1)
    expect(useQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    )

    useMemberPayments('member-1', 0.5)
    expect(useQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    )
  })
})
