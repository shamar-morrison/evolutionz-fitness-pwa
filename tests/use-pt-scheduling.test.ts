import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const { fetchPtAssignmentsMock, useQueryMock } = vi.hoisted(() => ({
  fetchPtAssignmentsMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    fetchPtAssignments: fetchPtAssignmentsMock,
  }
})

import { usePtAssignments } from '@/hooks/use-pt-scheduling'

describe('usePtAssignments', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('configures PT assignments with a 2 minute stale time and disables focus refetching', async () => {
    const refetchMock = vi.fn()

    useQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: refetchMock,
    })

    usePtAssignments({ status: 'active' })

    const queryOptions = useQueryMock.mock.calls[0]?.[0]

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [...queryKeys.ptScheduling.assignments, { status: 'active' }],
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
      }),
    )

    await queryOptions.queryFn()

    expect(fetchPtAssignmentsMock).toHaveBeenCalledWith({ status: 'active' })
  })
})
