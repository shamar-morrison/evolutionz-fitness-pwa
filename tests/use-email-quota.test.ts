import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const { fetchEmailQuotaMock, useQueryMock } = vi.hoisted(() => ({
  fetchEmailQuotaMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('@/lib/email-quota', () => ({
  fetchEmailQuota: fetchEmailQuotaMock,
}))

import { useEmailQuota } from '@/hooks/use-email-quota'

describe('useEmailQuota', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('configures the quota query with a 1 minute stale time and focus refetching', async () => {
    const refetchMock = vi.fn()

    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    })

    useEmailQuota()

    const queryOptions = useQueryMock.mock.calls[0]?.[0]

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.email.quota,
        enabled: true,
        staleTime: 60_000,
        refetchOnWindowFocus: true,
      }),
    )

    await queryOptions.queryFn()

    expect(fetchEmailQuotaMock).toHaveBeenCalledTimes(1)
  })
})
