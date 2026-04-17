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

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-root">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}))

vi.mock('@/components/dashboard-signups-chart-card', () => ({
  DashboardSignupsChartCard: ({
    currentMonthCount,
    href,
  }: {
    currentMonthCount: number
    href: string
  }) => <a href={href}>{`Member Signups (Last 6 Months)|${currentMonthCount} this month`}</a>,
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
        activeMembersLastMonth: 10,
        totalExpiredMembers: 3,
        expiringSoon: 4,
        signedUpThisMonth: 5,
        signupsByMonth: [
          { month: '2025-11', count: 0 },
          { month: '2025-12', count: 1 },
          { month: '2026-01', count: 2 },
          { month: '2026-02', count: 3 },
          { month: '2026-03', count: 4 },
          { month: '2026-04', count: 5 },
        ],
        expiredThisMonth: 2,
        expiredThisMonthLastMonth: 1,
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

  it('renders the refreshed dashboard content for admins', async () => {
    await act(async () => {
      root.render(<DashboardPage />)
    })

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Active Members12')
    expect(container.textContent).toContain('Total Expired Members3')
    expect(container.textContent).toContain('Expired This Month2')
    expect(container.textContent).toContain('Expiring Soon (7 days)4')
    expect(container.textContent).toContain('Member Signups (Last 6 Months)|5 this month')
    expect(container.textContent).toContain("Compared to last month's active member count")
    expect(container.textContent).toContain("Compared to last month's expiry count")
    expect(container.textContent).toContain('+2 (+20.0%)')
    expect(container.textContent).toContain('+1 (+100.0%)')
    expect(container.textContent).toContain('Quick Actions Content')
    expect(container.querySelectorAll('[data-testid="tooltip-root"]')).toHaveLength(2)

    expect(container.querySelector('a[href="/dashboard/expiring-members"]')?.textContent).toContain(
      'Expiring Soon (7 days)4',
    )

    const reportLinks = Array.from(container.querySelectorAll('a')).map((link) => ({
      href: link.getAttribute('href') ?? '',
      text: link.textContent ?? '',
    }))

    expect(
      reportLinks.find(
        (link) =>
          link.href.includes('/reports/members') &&
          link.href.includes('tab=signups') &&
          link.href.includes('period=this-month'),
      )?.text,
    ).toContain('Member Signups (Last 6 Months)')

    expect(
      reportLinks.find(
        (link) =>
          link.href.includes('/reports/members') &&
          link.href.includes('tab=expired') &&
          link.href.includes('period=this-month'),
      )?.text,
    ).toContain('Expired This Month2')
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
