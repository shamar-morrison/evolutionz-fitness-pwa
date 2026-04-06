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

import PendingRescheduleRequestsPage from '@/app/(app)/pending-approvals/reschedule-requests/page'
import PendingSessionUpdatesPage from '@/app/(app)/pending-approvals/session-updates/page'

describe('PendingApprovalsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useRescheduleRequestsMock.mockReturnValue({
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
    vi.clearAllMocks()
  })

  it('renders the reschedule requests page content', async () => {
    await act(async () => {
      root.render(<PendingRescheduleRequestsPage />)
    })

    expect(container.textContent).toContain('Pending Approvals')
    expect(container.textContent).toContain('Reschedule Requests')
    expect(container.textContent).toContain('Move to Saturday.')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Client One')
  })

  it('renders the session updates page content', async () => {
    await act(async () => {
      root.render(<PendingSessionUpdatesPage />)
    })

    expect(container.textContent).toContain('Pending Approvals')
    expect(container.textContent).toContain('Session Updates')
    expect(container.textContent).toContain('Client completed the workout.')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Client One')
  })
})
