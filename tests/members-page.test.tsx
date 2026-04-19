// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  configFeatures,
  invalidateQueriesMock,
  searchParamsValue,
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
  configFeatures: {
    showSyncCardsButton: true,
    showSyncMembersButton: true,
  },
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  searchParamsValue: {
    value: '',
  },
  useMembersMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsValue.value),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/hooks/use-members', () => ({
  useMembers: useMembersMock,
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/components/add-member-modal', () => ({
  AddMemberModal: ({ open }: { open: boolean }) => (
    <div data-testid="add-member-modal">{open ? 'open' : 'closed'}</div>
  ),
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
  const SelectContext = React.createContext<
    | {
        value?: string
        onValueChange?: (value: string) => void
      }
    | undefined
  >(undefined)

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
      value?: string
    }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value: string
    }) => {
      const context = React.useContext(SelectContext)

      return (
        <button
          type="button"
          data-select-item-value={value}
          onClick={() => context?.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({ children, id, className }: React.ComponentProps<'button'>) => (
      <button id={id} type="button" className={className}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const value = React.useContext(SelectContext)?.value

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
      get showSyncCardsButton() {
        return configFeatures.showSyncCardsButton
      },
      get showSyncMembersButton() {
        return configFeatures.showSyncMembersButton
      },
    },
  },
}))

import MembersPage from '@/app/(app)/members/page'

function syncSearchParamsFromLocation() {
  searchParamsValue.value = window.location.search.replace(/^\?/u, '')
}

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
    configFeatures.showSyncCardsButton = true
    configFeatures.showSyncMembersButton = true
    searchParamsValue.value = ''
    window.history.replaceState({}, '', '/members')

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
    expect(container.querySelector('button[data-select-item-value="Expiring"]')).not.toBeNull()

    const optionValues = Array.from(container.querySelectorAll('button[data-select-item-value]')).map(
      (button) => button.getAttribute('data-select-item-value'),
    )

    expect(optionValues.indexOf('Expiring')).toBe(optionValues.indexOf('Paused') + 1)

    const searchField = container.querySelector('input[placeholder="Search by name or card ID..."]')
    expect(searchField).not.toBeNull()
  })

  it('initializes the filters from search params while ignoring table-state params', async () => {
    searchParamsValue.value =
      'search=Marcus&status=Expiring&type=General&page=3&pageSize=25&sort=endTime&direction=desc'

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(
      (container.querySelector('input[placeholder="Search by name or card ID..."]') as HTMLInputElement)
        .value,
    ).toBe('Marcus')
    expect(container.querySelector('#members-status-filter')?.textContent).toContain('Expiring')
    expect(container.querySelector('#members-type-filter')?.textContent).toContain('General')
    expect(useMembersMock).toHaveBeenCalledWith({
      search: 'Marcus',
      status: 'Expiring',
      type: 'General',
    })
  })

  it('updates same-page status filter state in the URL without router navigation', async () => {
    await act(async () => {
      root.render(<MembersPage />)
    })

    const expiringOption = container.querySelector('button[data-select-item-value="Expiring"]')

    if (!(expiringOption instanceof HTMLButtonElement)) {
      throw new Error('Expiring status option not found.')
    }

    await act(async () => {
      expiringOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    syncSearchParamsFromLocation()
    expect(window.location.pathname + window.location.search).toBe('/members?status=Expiring')
  })

  it('keeps the shared status filter visible for front desk staff while hiding sync buttons', async () => {
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
    expect(container.querySelector('#members-status-filter')?.textContent).toContain('All')
    expect(container.querySelector('button[data-select-item-value="Expiring"]')).not.toBeNull()
  })

  it('shows only Sync Cards for admins when member sync is disabled', async () => {
    configFeatures.showSyncMembersButton = false

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.textContent).toContain('Sync Cards')
    expect(container.textContent).not.toContain('Sync Members')
  })

  it('hides Sync Cards for non-admin users even when card sync is enabled', async () => {
    authState.profile = {
      id: 'trainer-1',
      name: 'Taylor Trainer',
      role: 'staff',
      titles: ['Trainer'],
    }
    authState.role = 'staff'

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.textContent).not.toContain('Sync Cards')
  })

  it('hides Sync Members when the feature flag is disabled', async () => {
    configFeatures.showSyncMembersButton = false

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.textContent).not.toContain('Sync Members')
  })

  it('opens the Add Member modal from the action query for users who can create members', async () => {
    searchParamsValue.value = 'action=add'

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.querySelector('[data-testid="add-member-modal"]')?.textContent).toBe('open')
  })

  it('does not open the Add Member modal from the action query for users without create permission', async () => {
    authState.profile = {
      id: 'trainer-1',
      name: 'Taylor Trainer',
      role: 'staff',
      titles: ['Trainer'],
    }
    authState.role = 'staff'
    searchParamsValue.value = 'action=add'

    await act(async () => {
      root.render(<MembersPage />)
    })

    expect(container.querySelector('[data-testid="add-member-modal"]')?.textContent).toBe('closed')
    expect(container.textContent).not.toContain('Add Member')
  })
})
