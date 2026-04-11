// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  invalidateQueriesMock,
  useMembersMock,
} = vi.hoisted(() => ({
  authState: {
    user: null,
    profile: {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
    role: 'admin' as 'admin' | 'staff',
    loading: false,
  },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  useMembersMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/components/add-member-modal', () => ({
  AddMemberModal: () => null,
}))

vi.mock('@/components/members-table', () => ({
  MembersTable: ({ members }: { members: unknown[] }) => <div>{members.length} members</div>,
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const SelectContext = React.createContext<string | undefined>(undefined)

  return {
    Select: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value?: string
    }) => <SelectContext.Provider value={value}>{children}</SelectContext.Provider>,
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value: string
    }) => <option value={value}>{children}</option>,
    SelectTrigger: ({ children, id, className }: React.ComponentProps<'button'>) => (
      <button id={id} type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const value = React.useContext(SelectContext)

      return <span>{value ?? placeholder}</span>
    },
  }
})

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div {...props} />,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: (props: React.ComponentProps<'svg'>) => <svg {...props} />,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/lib/hik-sync', () => ({
  syncMembersFromDevice: vi.fn(),
}))

vi.mock('@/lib/available-cards', () => ({
  syncAvailableAccessCards: vi.fn(),
}))

vi.mock('@/lib/config', () => ({
  config: {
    features: {
      showSyncButtons: true,
    },
  },
}))

import MembersPage from '@/app/(app)/members/page'

describe('MembersPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    authState.profile = {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    }
    authState.role = 'admin'
    authState.loading = false

    useMembersMock.mockReturnValue({
      members: [],
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

  it('shows labeled status and type filters next to their selects', async () => {
    await act(async () => {
      root.render(<MembersPage />)
    })

    const statusLabel = container.querySelector('label[for="members-status-filter"]')
    const typeLabel = container.querySelector('label[for="members-type-filter"]')

    expect(statusLabel?.textContent).toBe('Status')
    expect(typeLabel?.textContent).toBe('Type')
    expect(container.querySelector('#members-status-filter')?.textContent).toContain('All')
    expect(container.querySelector('#members-type-filter')?.textContent).toContain('All')

    const searchField = container.querySelector('input[placeholder="Search by name or card ID..."]')
    expect(searchField).not.toBeNull()
  })

  it('hides sync buttons for front desk staff while keeping Add Member visible', async () => {
    authState.profile = {
      id: 'assistant-1',
      name: 'Avery Assistant',
      role: 'staff',
      titles: ['Administrative Assistant'],
    }
    authState.role = 'staff'

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.textContent).toContain('Add Member')
    expect(container.textContent).not.toContain('Sync Cards')
    expect(container.textContent).not.toContain('Sync Members')
  })
})
