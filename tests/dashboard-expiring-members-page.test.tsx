// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardMemberListItem } from '@/types'

const {
  currentRoleState,
  pushMock,
  useExpiringDashboardMembersMock,
} = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  pushMock: vi.fn(),
  useExpiringDashboardMembersMock: vi.fn(),
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

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-dashboard-members', () => ({
  useExpiringDashboardMembers: useExpiringDashboardMembersMock,
}))

import ExpiringMembersPage from '@/app/(app)/dashboard/expiring-members/page'

function createMember(overrides: Partial<DashboardMemberListItem> = {}): DashboardMemberListItem {
  return {
    id: overrides.id ?? 'member-1',
    name: overrides.name ?? 'Marcus Brown',
    type: overrides.type ?? 'General',
    status: overrides.status ?? 'Active',
    endTime: overrides.endTime ?? '2026-04-05T23:59:59.000Z',
  }
}

describe('ExpiringMembersPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRoleState.role = 'admin'
    pushMock.mockReset()
    useExpiringDashboardMembersMock.mockReturnValue({
      data: [
        createMember({
          id: 'member-1',
          name: 'Marcus Brown',
          endTime: '2026-04-05T23:59:59.000Z',
        }),
        createMember({
          id: 'member-2',
          name: 'Alicia Green',
          endTime: '2026-04-09T23:59:59.000Z',
        }),
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
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows only active members expiring in the next 7 days and keeps row navigation working', async () => {
    await act(async () => {
      root.render(<ExpiringMembersPage />)
    })

    expect(useExpiringDashboardMembersMock).toHaveBeenCalledWith()
    expect(container.textContent).toContain('Expiring Members')
    expect(container.textContent).toContain('Marcus Brown')
    expect(container.textContent).toContain('Alicia Green')
    expect(container.textContent).not.toContain('Expired Member')
    expect(container.textContent).not.toContain('Suspended Member')
    expect(container.textContent).not.toContain('Future Member')

    const firstDataRow = container.querySelector('tbody tr')

    if (!(firstDataRow instanceof HTMLTableRowElement)) {
      throw new Error('Expected the members table to render at least one row.')
    }

    await act(async () => {
      firstDataRow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushMock).toHaveBeenCalledWith('/members/member-1')
  })

  it('shows loading skeletons while members are loading', async () => {
    useExpiringDashboardMembersMock.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<ExpiringMembersPage />)
    })

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows an empty state when no memberships are expiring soon', async () => {
    useExpiringDashboardMembersMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<ExpiringMembersPage />)
    })

    expect(container.textContent).toContain('No memberships expiring in the next 7 days.')
  })

  it('shows an error state with a dashboard escape hatch when members fail to load', async () => {
    useExpiringDashboardMembersMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('select exploded'),
      refetch: vi.fn(),
    })

    await act(async () => {
      root.render(<ExpiringMembersPage />)
    })

    expect(container.textContent).toContain('Failed to load expiring members')

    const backButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back to Dashboard',
    )

    if (!(backButton instanceof HTMLButtonElement)) {
      throw new Error('Back to Dashboard button not found.')
    }

    await act(async () => {
      backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushMock).toHaveBeenCalledWith('/dashboard')
  })
})
