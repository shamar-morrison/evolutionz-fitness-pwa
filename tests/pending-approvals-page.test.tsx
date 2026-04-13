// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  useRescheduleRequestsMock,
  useSessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  useRescheduleRequestsMock: vi.fn(),
  useSessionUpdateRequestsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useRescheduleRequests: useRescheduleRequestsMock,
  useSessionUpdateRequests: useSessionUpdateRequestsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'admin-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    },
  }),
}))

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/redirect-on-mount', () => ({
  RedirectOnMount: () => null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    disabled,
  }: {
    onSelect?: (date: Date | undefined) => void
    disabled?: (date: Date) => boolean
  }) => {
    const dates = [
      { label: 'Apr 12 2026', date: new Date(2026, 3, 12) },
      { label: 'Apr 13 2026', date: new Date(2026, 3, 13) },
      { label: 'Apr 6 2026', date: new Date(2026, 3, 6) },
      { label: 'Apr 5 2026', date: new Date(2026, 3, 5) },
    ]

    return (
      <div>
        {dates.map(({ label, date }) => (
          <button
            key={label}
            type="button"
            aria-label={`Select ${label}`}
            disabled={disabled ? disabled(date) : false}
            onClick={() => onSelect?.(date)}
          >
            {label}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react')

  const TabsContext = React.createContext<{
    value: string
    setValue: (value: string) => void
  } | null>(null)

  function Tabs({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) {
    return (
      <TabsContext.Provider value={{ value, setValue: onValueChange }}>
        <div>{children}</div>
      </TabsContext.Provider>
    )
  }

  function TabsList({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function TabsTrigger({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) {
    const context = React.useContext(TabsContext)

    if (!context) {
      return null
    }

    return (
      <button type="button" onClick={() => context.setValue(value)}>
        {children}
      </button>
    )
  }

  function TabsContent({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) {
    const context = React.useContext(TabsContext)

    if (!context || context.value !== value) {
      return null
    }

    return <div>{children}</div>
  }

  return {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  }
})

import PendingRescheduleRequestsPage from '@/app/(app)/pending-approvals/reschedule-requests/page'
import PendingSessionUpdatesPage from '@/app/(app)/pending-approvals/session-updates/page'

function getButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

function getButtonByAriaLabel(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

describe('PendingApprovalsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T15:07:00.000Z'))
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useRescheduleRequestsMock.mockImplementation((status?: string) => {
      if (status === 'approved') {
        return {
          requests: [
            {
              id: 'request-2',
              trainerName: 'Jordan Trainer',
              requestedByName: 'Jordan Trainer',
              memberName: 'Client Two',
              sessionScheduledAt: '2026-04-11T10:00:00.000Z',
              proposedAt: '2026-04-13T11:00:00.000Z',
              note: 'Approved move.',
              status: 'approved',
            },
          ],
          isLoading: false,
          error: null,
        }
      }

      if (status === 'denied') {
        return {
          requests: [],
          isLoading: false,
          error: null,
        }
      }

      return {
        requests: [
          {
            id: 'request-1',
            trainerName: 'Jordan Trainer',
            requestedByName: 'Jordan Trainer',
            memberName: 'Client One',
            sessionScheduledAt: '2026-04-10T10:00:00.000Z',
            proposedAt: '2026-04-12T10:00:00.000Z',
            note: 'Move to Saturday.',
            status: 'pending',
          },
        ],
        isLoading: false,
        error: null,
      }
    })
    useSessionUpdateRequestsMock.mockReturnValue({
      requests: [
        {
          id: 'update-1',
          trainerName: 'Jordan Trainer',
          requestedByName: 'Jordan Trainer',
          memberName: 'Client One',
          sessionScheduledAt: '2026-04-10T10:00:00.000Z',
          requestedStatus: 'completed',
          note: 'Client completed the workout.',
          status: 'pending',
        },
      ],
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
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('renders the reschedule requests page content', async () => {
    await act(async () => {
      root.render(<PendingRescheduleRequestsPage />)
    })

    expect(container.textContent).toContain('Notifications')
    expect(container.textContent).toContain('Reschedule Requests')
    expect(container.textContent).toContain('Pending')
    expect(container.textContent).toContain('Move to Saturday.')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Client One')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith('pending', {
      enabled: true,
    })
  })

  it('loads approved and denied reschedule requests only when their tabs become active', async () => {
    await act(async () => {
      root.render(<PendingRescheduleRequestsPage />)
    })

    expect(container.textContent).toContain('Move to Saturday.')
    expect(useRescheduleRequestsMock).not.toHaveBeenCalledWith('approved', {
      enabled: true,
    })

    await act(async () => {
      getButton(container, 'Approved').click()
    })

    expect(container.textContent).toContain('Approved move.')
    expect(container.textContent).toContain('Client Two')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith('approved', {
      enabled: true,
    })

    await act(async () => {
      getButton(container, 'Denied').click()
    })

    expect(container.textContent).toContain('No denied reschedule requests.')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith('denied', {
      enabled: true,
    })
  })

  it('uses the shared picker in the reschedule review modal and blocks past approval times', async () => {
    await act(async () => {
      root.render(<PendingRescheduleRequestsPage />)
    })

    await act(async () => {
      getButton(container, 'Review').click()
    })

    expect(container.textContent).toContain('April 12, 2026 at 5:00 AM')

    await act(async () => {
      getButtonByAriaLabel(container, 'Select Apr 6 2026').click()
    })
    await act(async () => {
      getButtonByAriaLabel(container, 'Hour 9').click()
    })

    expect(container.textContent).toContain('Proposed date and time must be in the future.')
    expect(getButton(container, 'Approve').disabled).toBe(true)
  })

  it('renders the session updates page content', async () => {
    await act(async () => {
      root.render(<PendingSessionUpdatesPage />)
    })

    expect(container.textContent).toContain('Notifications')
    expect(container.textContent).toContain('Session Updates')
    expect(container.textContent).toContain('Client completed the workout.')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Client One')
  })
})
