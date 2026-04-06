// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invalidateQueriesMock,
  markAllNotificationsAsReadMock,
  markNotificationAsReadMock,
  pushMock,
  useNotificationsMock,
} = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  markAllNotificationsAsReadMock: vi.fn().mockResolvedValue(undefined),
  markNotificationAsReadMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  useNotificationsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    },
    loading: false,
  }),
}))

vi.mock('@/hooks/use-notifications', () => ({
  markAllNotificationsAsRead: markAllNotificationsAsReadMock,
  markNotificationAsRead: markNotificationAsReadMock,
  useNotifications: useNotificationsMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  SheetDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  SheetHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  SheetTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { NotificationsPanel } from '@/components/notifications-panel'

describe('NotificationsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useNotificationsMock.mockReturnValue({
      notifications: [],
      unreadCount: 0,
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

  it('shows a capped unread badge when there are more than nine unread notifications', async () => {
    useNotificationsMock.mockReturnValue({
      notifications: [],
      unreadCount: 11,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    expect(container.textContent).toContain('9+')
  })

  it('routes status change review notifications to the session updates page and marks them as read', async () => {
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'status_change_request',
          title: 'Session Update Request',
          body: 'Jordan Trainer requested a completed mark.',
          read: false,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      unreadCount: 1,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const reviewButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Review',
    )

    if (!(reviewButton instanceof HTMLButtonElement)) {
      throw new Error('Review button not found.')
    }

    await act(async () => {
      reviewButton.click()
    })

    expect(markNotificationAsReadMock).toHaveBeenCalledWith('user-1', 'notification-1')
    expect(pushMock).toHaveBeenCalledWith('/pending-approvals/session-updates')
  })
})
