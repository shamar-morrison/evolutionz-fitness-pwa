// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { currentRoleState, useDashboardStatsMock } = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  useDashboardStatsMock: vi.fn(),
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({
    role,
    children,
    fallback = null,
  }: {
    role: 'admin' | 'staff'
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (role === 'admin' && currentRoleState.role !== 'admin' ? <>{fallback}</> : <>{children}</>),
}))

vi.mock('@/components/authenticated-home-redirect', () => ({
  AuthenticatedHomeRedirect: () => <div>redirect:home</div>,
}))

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: useDashboardStatsMock,
}))

vi.mock('@/components/dashboard-member-panels', () => ({
  ExpiringThisWeekCard: () => <div>Expiring This Week</div>,
  RecentlyAddedMembersCard: () => <div>Recently Added Members</div>,
}))

vi.mock('@/components/stat-card', () => ({
  StatCard: ({
    title,
    value,
    href,
  }: {
    title: string
    value: number
    href?: string
  }) =>
    href ? <a href={href}>{`${title}:${value}`}</a> : <div>{`${title}:${value}`}</div>,
}))

vi.mock('@/components/quick-actions', () => ({
  QuickActions: () => <div>Quick Actions Content</div>,
}))

import DashboardPage from '@/app/(app)/dashboard/page'

describe('DashboardPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRoleState.role = 'admin'
    useDashboardStatsMock.mockReturnValue({
      data: {
        activeMembers: 12,
        expiredMembers: 3,
        expiringSoon: 4,
      },
      isLoading: false,
      error: null,
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
    vi.clearAllMocks()
  })

  it('renders dashboard content for admins', async () => {
    await act(async () => {
      root.render(<DashboardPage />)
    })

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Active Members:12')
    expect(container.textContent).toContain('Quick Actions Content')
    expect(container.querySelector('a[href="/dashboard/expiring-members"]')?.textContent).toBe(
      'Expiring Soon (7 days):4',
    )
  })

  it('redirects staff users to their authenticated home', async () => {
    currentRoleState.role = 'staff'

    await act(async () => {
      root.render(<DashboardPage />)
    })

    expect(container.textContent).toContain('redirect:home')
    expect(container.textContent).not.toContain('Quick Actions Content')
  })
})
