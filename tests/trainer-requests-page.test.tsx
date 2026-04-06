// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  useMyRescheduleRequestsMock,
  useMySessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  useMyRescheduleRequestsMock: vi.fn(),
  useMySessionUpdateRequestsMock: vi.fn(),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'trainer-1',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    },
  }),
}))

vi.mock('@/components/staff-only', () => ({
  StaffOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useMyRescheduleRequests: useMyRescheduleRequestsMock,
  useMySessionUpdateRequests: useMySessionUpdateRequestsMock,
}))

vi.mock('@/components/ui/tabs', async () => {
  const React = await import('react')

  const TabsContext = React.createContext<{
    value: string
    setValue: (value: string) => void
  } | null>(null)

  function Tabs({
    children,
    defaultValue,
  }: {
    children: React.ReactNode
    defaultValue: string
  }) {
    const [value, setValue] = React.useState(defaultValue)

    return (
      <TabsContext.Provider value={{ value, setValue }}>
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

import TrainerRequestsPage from '@/app/(app)/trainer/requests/page'

function getButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

describe('TrainerRequestsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useMyRescheduleRequestsMock.mockReturnValue({
      requests: [
        {
          id: 'request-1',
          sessionId: 'session-1',
          requestedBy: 'trainer-1',
          requestedByName: 'Jordan Trainer',
          proposedAt: '2026-04-12T10:00:00.000Z',
          note: 'Need to move this session.',
          status: 'pending',
          reviewedBy: null,
          reviewNote: null,
          reviewedAt: null,
          createdAt: '2026-04-04T10:00:00.000Z',
          updatedAt: '2026-04-04T10:00:00.000Z',
          sessionScheduledAt: '2026-04-10T10:00:00.000Z',
          memberName: 'Client One',
          trainerName: 'Jordan Trainer',
        },
      ],
      isLoading: false,
      error: null,
    })
    useMySessionUpdateRequestsMock.mockReturnValue({
      requests: [
        {
          id: 'update-1',
          sessionId: 'session-1',
          requestedBy: 'trainer-1',
          requestedByName: 'Jordan Trainer',
          requestedStatus: 'completed',
          note: 'Client completed the workout.',
          status: 'approved',
          reviewedBy: 'admin-1',
          reviewNote: null,
          reviewedAt: '2026-04-05T10:00:00.000Z',
          createdAt: '2026-04-04T10:00:00.000Z',
          updatedAt: '2026-04-05T10:00:00.000Z',
          sessionScheduledAt: '2026-04-10T10:00:00.000Z',
          memberName: 'Client One',
          trainerName: 'Jordan Trainer',
        },
        {
          id: 'update-2',
          sessionId: 'session-2',
          requestedBy: 'trainer-1',
          requestedByName: 'Jordan Trainer',
          requestedStatus: 'cancelled',
          note: 'Member could not attend.',
          status: 'denied',
          reviewedBy: 'admin-1',
          reviewNote: 'Please confirm with the member first.',
          reviewedAt: '2026-04-06T10:00:00.000Z',
          createdAt: '2026-04-04T11:00:00.000Z',
          updatedAt: '2026-04-06T10:00:00.000Z',
          sessionScheduledAt: '2026-04-11T10:00:00.000Z',
          memberName: 'Client Two',
          trainerName: 'Jordan Trainer',
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
    vi.clearAllMocks()
  })

  it('renders trainer request tabs and shows denied cancellation reasons', async () => {
    await act(async () => {
      root.render(<TrainerRequestsPage />)
    })

    expect(container.textContent).toContain('My Requests')
    expect(container.textContent).toContain('Reschedules')
    expect(container.textContent).toContain('Session Updates')
    expect(container.textContent).toContain('Cancellations')
    expect(container.textContent).toContain('Client One')
    expect(container.textContent).toContain('Need to move this session.')

    await act(async () => {
      getButton(container, 'Cancellations').click()
    })

    expect(container.textContent).toContain('Client Two')
    expect(container.textContent).toContain('Cancelled')
    expect(container.textContent).toContain('Reason: Please confirm with the member first.')
  })

  it('shows the exact empty states for each trainer request tab', async () => {
    useMyRescheduleRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })
    useMySessionUpdateRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<TrainerRequestsPage />)
    })

    expect(container.textContent).toContain('No reschedule requests submitted.')

    await act(async () => {
      getButton(container, 'Session Updates').click()
    })

    expect(container.textContent).toContain('No session update requests submitted.')

    await act(async () => {
      getButton(container, 'Cancellations').click()
    })

    expect(container.textContent).toContain('No cancellation requests submitted.')
  })
})
