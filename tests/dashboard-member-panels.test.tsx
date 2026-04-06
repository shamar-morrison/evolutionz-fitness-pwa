// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useRecentDashboardMembersMock, useExpiringDashboardMembersMock } = vi.hoisted(() => ({
  useRecentDashboardMembersMock: vi.fn(),
  useExpiringDashboardMembersMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={typeof href === 'string' ? href : ''} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-dashboard-members', () => ({
  useRecentDashboardMembers: useRecentDashboardMembersMock,
  useExpiringDashboardMembers: useExpiringDashboardMembersMock,
}))

import { ExpiringThisWeekCard } from '@/components/dashboard-member-panels'

describe('ExpiringThisWeekCard', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useRecentDashboardMembersMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    useExpiringDashboardMembersMock.mockReturnValue({
      data: [
        {
          id: 'member-1',
          name: 'Marcus Brown',
          type: 'General',
          status: 'Active',
          endTime: '2026-04-04T00:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.restoreAllMocks()
  })

  it('renders the expiry date from the stored calendar date without a timezone shift', async () => {
    await act(async () => {
      root.render(<ExpiringThisWeekCard />)
    })

    expect(container.textContent).toContain('4 Apr 2026')
    expect(container.textContent).not.toContain('3 Apr 2026')
  })
})
