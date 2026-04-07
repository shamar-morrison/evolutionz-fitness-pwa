// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const {
  invalidateQueriesMock,
  reviewRescheduleRequestMock,
  reviewSessionUpdateRequestMock,
  toastMock,
  useRescheduleRequestsMock,
  useSessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  reviewRescheduleRequestMock: vi.fn(),
  reviewSessionUpdateRequestMock: vi.fn(),
  toastMock: vi.fn(),
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
  toast: toastMock,
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

vi.mock('@/lib/pt-scheduling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pt-scheduling')>('@/lib/pt-scheduling')

  return {
    ...actual,
    reviewRescheduleRequest: reviewRescheduleRequestMock,
    reviewSessionUpdateRequest: reviewSessionUpdateRequestMock,
  }
})

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    loading = false,
    type = 'button',
    ...props
  }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button data-loading={loading ? 'true' : 'false'} type={type} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    open = true,
  }: {
    children: React.ReactNode
    open?: boolean
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    isLoading = false,
  }: React.ComponentProps<'div'> & { isLoading?: boolean }) => (
    <div data-is-loading={isLoading ? 'true' : 'false'}>{children}</div>
  ),
  DialogDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DialogFooter: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DialogTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
}))

import { PendingApprovalsPageContent } from '@/components/pending-approvals-page-content'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
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

describe('PendingApprovalsPageContent loading wiring', () => {
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
          id: 'reschedule-1',
          sessionId: 'session-1',
          trainerId: 'trainer-1',
          trainerName: 'Jordan Trainer',
          requestedById: 'trainer-1',
          requestedByName: 'Jordan Trainer',
          memberId: 'member-1',
          memberName: 'Client One',
          sessionScheduledAt: '2026-04-10T10:00:00.000Z',
          proposedAt: '2026-04-11T10:00:00.000Z',
          note: 'Client asked for a later time.',
          reviewNote: null,
          status: 'pending',
          reviewedById: null,
          reviewedByName: null,
          reviewedAt: null,
          createdAt: '2026-04-09T10:00:00.000Z',
          updatedAt: '2026-04-09T10:00:00.000Z',
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

  it('shows loading only on the clicked session update review action', async () => {
    const deferred = createDeferred<void>()
    reviewSessionUpdateRequestMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<PendingApprovalsPageContent view="session-updates" />)
    })

    await act(async () => {
      getButton(container, 'Review').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const approveButton = getButton(container, 'Approve')
    const denyButton = getButton(container, 'Deny')
    const cancelButton = getButton(container, 'Cancel')

    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(approveButton.getAttribute('data-loading')).toBe('true')
    expect(denyButton.getAttribute('data-loading')).toBe('false')
    expect(cancelButton.getAttribute('data-loading')).toBe('false')
    expect(approveButton.disabled).toBe(true)
    expect(denyButton.disabled).toBe(true)
    expect(cancelButton.disabled).toBe(true)

    deferred.resolve()
    await flushAsyncWork()
  })

  it('shows loading only on the clicked reschedule review action', async () => {
    const deferred = createDeferred<void>()
    reviewRescheduleRequestMock.mockReturnValue(deferred.promise)

    await act(async () => {
      root.render(<PendingApprovalsPageContent view="reschedule-requests" />)
    })

    await act(async () => {
      getButton(container, 'Review').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const denyButton = getButton(container, 'Deny')
    const approveButton = getButton(container, 'Approve')
    const cancelButton = getButton(container, 'Cancel')

    await act(async () => {
      denyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.querySelector('[data-is-loading="true"]')).not.toBeNull()
    expect(denyButton.getAttribute('data-loading')).toBe('true')
    expect(approveButton.getAttribute('data-loading')).toBe('false')
    expect(cancelButton.getAttribute('data-loading')).toBe('false')
    expect(denyButton.disabled).toBe(true)
    expect(approveButton.disabled).toBe(true)
    expect(cancelButton.disabled).toBe(true)

    deferred.resolve()
    await flushAsyncWork()
  })

  it('invalidates archived notifications after an approval review archives matching requests', async () => {
    reviewSessionUpdateRequestMock.mockResolvedValue(undefined)

    await act(async () => {
      root.render(<PendingApprovalsPageContent view="session-updates" />)
    })

    await act(async () => {
      getButton(container, 'Review').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const approveButton = getButton(container, 'Approve')

    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.notifications.archived('admin-1'),
    })
  })
})
