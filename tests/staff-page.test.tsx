// @vitest-environment jsdom

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types'

const { useStaffMock } = vi.hoisted(() => ({
  useStaffMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-staff', () => ({
  useStaff: useStaffMock,
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/add-staff-modal', () => ({
  AddStaffModal: () => null,
}))

vi.mock('@/components/member-avatar', () => ({
  MemberAvatar: ({ name }: { name: string }) => <div>{name}</div>,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
}))

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  EmptyDescription: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  EmptyHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  EmptyMedia: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  EmptyTitle: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: React.ComponentProps<'div'>) => <div {...props} />,
}))

vi.mock('@/components/ui/tabs', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const TabsContext = React.createContext<(value: string) => void>(() => {})

  return {
    Tabs: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
    }) => (
      <TabsContext.Provider value={onValueChange ?? (() => {})}>{children}</TabsContext.Provider>
    ),
    TabsList: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
    TabsTrigger: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value: string
    }) => {
      const onValueChange = React.useContext(TabsContext)

      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      )
    },
  }
})

import StaffPage from '@/app/(app)/staff/page'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Jordan Trainer',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function getButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

function expectShellVisible(container: HTMLDivElement) {
  expect(container.textContent).toContain('Staff')
  expect(getButton(container, 'Add Staff')).toBeDefined()
  expect(getButton(container, 'Active')).toBeDefined()
  expect(getButton(container, 'Archived')).toBeDefined()
  expect(getButton(container, 'All')).toBeDefined()
}

describe('StaffPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStaffMock.mockImplementation((options?: { archived?: boolean; enabled?: boolean }) => ({
      staff:
        options?.archived
          ? [createProfile({ id: 'archived-1', archivedAt: '2026-04-01T00:00:00.000Z' })]
          : [createProfile()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }))
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

  it('only enables the archived staff query after the archived tab becomes active', async () => {
    await act(async () => {
      root.render(<StaffPage />)
    })

    expect(useStaffMock).toHaveBeenNthCalledWith(1)
    expect(useStaffMock).toHaveBeenNthCalledWith(2, {
      archived: true,
      enabled: false,
    })

    await act(async () => {
      getButton(container, 'Archived').click()
    })

    expect(useStaffMock).toHaveBeenNthCalledWith(4, {
      archived: true,
      enabled: true,
    })
  })

  it('keeps the staff page shell visible and only shows list skeletons while archived staff loads', async () => {
    useStaffMock.mockImplementation((options?: { archived?: boolean; enabled?: boolean }) => {
      if (options?.archived && options.enabled) {
        return {
          staff: [],
          isLoading: true,
          error: null,
          refetch: vi.fn(),
        }
      }

      return {
        staff:
          options?.archived
            ? [createProfile({ id: 'archived-1', archivedAt: '2026-04-01T00:00:00.000Z' })]
            : [createProfile()],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }
    })

    await act(async () => {
      root.render(<StaffPage />)
    })

    await act(async () => {
      getButton(container, 'Archived').click()
    })

    expectShellVisible(container)
    expect(container.querySelector('[data-testid="staff-list-loading"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Jordan Trainer')
  })

  it('keeps the staff page shell visible when the archived query fails and scopes the error to the list region', async () => {
    useStaffMock.mockImplementation((options?: { archived?: boolean; enabled?: boolean }) => {
      if (options?.archived && options.enabled) {
        return {
          staff: [],
          isLoading: false,
          error: new Error('Archived fetch failed'),
          refetch: vi.fn(),
        }
      }

      return {
        staff: [createProfile()],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }
    })

    await act(async () => {
      root.render(<StaffPage />)
    })

    await act(async () => {
      getButton(container, 'Archived').click()
    })

    expectShellVisible(container)
    expect(container.textContent).toContain('Failed to load staff')
  })
})
