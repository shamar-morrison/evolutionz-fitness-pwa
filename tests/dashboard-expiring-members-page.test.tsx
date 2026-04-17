// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/types'

const {
  currentRoleState,
  pushMock,
  useMembersMock,
} = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  pushMock: vi.fn(),
  useMembersMock: vi.fn(),
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

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

import ExpiringMembersPage from '@/app/(app)/dashboard/expiring-members/page'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? '0001',
    name: overrides.name ?? 'Marcus Brown',
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? null,
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? null,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? '2026-03-01T00:00:00.000Z',
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
    useMembersMock.mockImplementation(
      (options: { status?: Member['status'] | 'All' } = {}) => {
        const sourceMembers = [
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
          createMember({
            id: 'member-3',
            name: 'Expired Member',
            status: 'Expired',
            endTime: '2026-04-05T23:59:59.000Z',
          }),
          createMember({
            id: 'member-4',
            name: 'Suspended Member',
            status: 'Suspended',
            endTime: '2026-04-06T23:59:59.000Z',
          }),
          createMember({
            id: 'member-5',
            name: 'Future Member',
            endTime: '2026-04-12T00:00:00.000Z',
          }),
        ]
        const filteredMembers =
          options.status && options.status !== 'All'
            ? sourceMembers.filter((member) => member.status === options.status)
            : sourceMembers

        return {
          members: filteredMembers,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }
      },
    )
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

    expect(useMembersMock).toHaveBeenCalledWith({ status: 'Active' })
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
    useMembersMock.mockReturnValue({
      members: [],
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
    useMembersMock.mockReturnValue({
      members: [
        createMember({
          id: 'member-8',
          name: 'Late Renewal',
          endTime: '2026-04-12T00:00:00.000Z',
        }),
      ],
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
    useMembersMock.mockReturnValue({
      members: [],
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
