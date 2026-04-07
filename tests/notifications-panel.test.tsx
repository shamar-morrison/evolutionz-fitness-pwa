// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  archiveClearableNotificationsMock,
  archiveNotificationMock,
  invalidateQueriesMock,
  markAllNotificationsAsReadMock,
  markNotificationAsReadMock,
  pushMock,
  useArchivedNotificationsMock,
  useIsMobileMock,
  useNotificationsMock,
} = vi.hoisted(() => ({
  authState: {
    profile: {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
    loading: false,
  },
  archiveClearableNotificationsMock: vi.fn().mockResolvedValue(undefined),
  archiveNotificationMock: vi.fn().mockResolvedValue(undefined),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  markAllNotificationsAsReadMock: vi.fn().mockResolvedValue(undefined),
  markNotificationAsReadMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  useArchivedNotificationsMock: vi.fn(),
  useIsMobileMock: vi.fn(),
  useNotificationsMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-notifications', () => ({
  archiveClearableNotifications: archiveClearableNotificationsMock,
  archiveNotification: archiveNotificationMock,
  markAllNotificationsAsRead: markAllNotificationsAsReadMock,
  markNotificationAsRead: markNotificationAsReadMock,
  useArchivedNotifications: useArchivedNotificationsMock,
  useNotifications: useNotificationsMock,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: useIsMobileMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({
    children,
    direction,
  }: {
    children: React.ReactNode
    direction?: string
  }) => <div data-direction={direction}>{children}</div>,
  DrawerClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DrawerDescription: ({ children }: React.ComponentProps<'p'>) => <p>{children}</p>,
  DrawerHeader: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DrawerTitle: ({ children }: React.ComponentProps<'h2'>) => <h2>{children}</h2>,
  DrawerTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    className?: string
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
    authState.profile = {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    }
    authState.loading = false
    useIsMobileMock.mockReturnValue(false)
    useNotificationsMock.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      error: null,
    })
    useArchivedNotificationsMock.mockReturnValue({
      notifications: [],
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
    expect(container.querySelector('[data-direction="right"]')).not.toBeNull()
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

  it('shows an archive control for read request notifications on admin accounts', async () => {
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'reschedule_request',
          title: 'Reschedule Request',
          body: 'Jordan Trainer requested a reschedule.',
          read: true,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
        {
          id: 'notification-2',
          type: 'reschedule_request',
          title: 'Reschedule Request',
          body: 'Jordan Trainer requested a reschedule.',
          read: false,
          createdAt: '2026-04-06T11:00:00.000Z',
        },
      ],
      unreadCount: 1,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const archiveButton = container.querySelector('button[aria-label="Archive Reschedule Request"]')

    expect(archiveButton).not.toBeNull()

    if (!(archiveButton instanceof HTMLButtonElement)) {
      throw new Error('Archive button not found.')
    }

    await act(async () => {
      archiveButton.click()
    })

    expect(archiveNotificationMock).toHaveBeenCalledWith('user-1', 'notification-1', 'admin')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'archived'],
    })
    expect(markNotificationAsReadMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('does not show an archive control for unread request notifications on admin accounts', async () => {
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

    expect(
      container.querySelector('button[aria-label="Archive Session Update Request"]'),
    ).toBeNull()
  })

  it('does not show an archive control for read request notifications on staff accounts', async () => {
    authState.profile = {
      id: 'user-1',
      name: 'Staff User',
      role: 'staff',
      titles: ['Trainer'],
    }
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'reschedule_request',
          title: 'Reschedule Request',
          body: 'Jordan Trainer requested a reschedule.',
          read: true,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      unreadCount: 0,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    expect(container.querySelector('button[aria-label="Archive Reschedule Request"]')).toBeNull()
  })

  it('uses a bottom drawer on mobile and marks all notifications as read', async () => {
    useIsMobileMock.mockReturnValue(true)
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'reschedule_request',
          title: 'Reschedule Request',
          body: 'Jordan Trainer requested a reschedule.',
          read: false,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      unreadCount: 2,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const markAllButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Mark all as read',
    )
    const clearAllButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Clear All',
    )

    if (!(markAllButton instanceof HTMLButtonElement)) {
      throw new Error('Mark all button not found.')
    }
    if (!(clearAllButton instanceof HTMLButtonElement)) {
      throw new Error('Clear All button not found.')
    }

    await act(async () => {
      markAllButton.click()
    })

    expect(container.querySelector('[data-direction="bottom"]')).not.toBeNull()
    expect(clearAllButton.disabled).toBe(true)
    expect(markAllNotificationsAsReadMock).toHaveBeenCalledWith('user-1')
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(2)
  })

  it('shows archived notifications in a read-only archived tab', async () => {
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'status_change_denied',
          title: 'Inbox Notification',
          body: 'Current inbox item.',
          read: true,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      unreadCount: 0,
      error: null,
    })
    useArchivedNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-archived',
          type: 'status_change_request',
          title: 'Archived Notification',
          body: 'Archived history item.',
          read: false,
          createdAt: '2026-04-05T10:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const archivedTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Archived',
    )

    if (!(archivedTab instanceof HTMLButtonElement)) {
      throw new Error('Archived tab not found.')
    }

    await act(async () => {
      archivedTab.click()
    })

    expect(container.textContent).toContain('Archived Notification')
    expect(container.textContent).not.toContain('Inbox Notification')
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Review')).toBe(false)
    expect(container.querySelector('button[aria-label="Archive Archived Notification"]')).toBeNull()

    const archivedCard = Array.from(container.querySelectorAll('div')).find((element) =>
      element.textContent?.includes('Archived Notification'),
    )

    expect(archivedCard?.getAttribute('role')).not.toBe('button')
  })

  it('shows archived notifications for staff accounts too', async () => {
    authState.profile = {
      id: 'user-1',
      name: 'Staff User',
      role: 'staff',
      titles: ['Trainer'],
    }
    useArchivedNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-archived',
          type: 'reschedule_approved',
          title: 'Archived Staff Notification',
          body: 'Staff archive history item.',
          read: true,
          createdAt: '2026-04-05T10:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const archivedTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Archived',
    )

    if (!(archivedTab instanceof HTMLButtonElement)) {
      throw new Error('Archived tab not found.')
    }

    await act(async () => {
      archivedTab.click()
    })

    expect(container.textContent).toContain('Archived Staff Notification')
  })

  it('archives clearable notifications from the Clear All action', async () => {
    useNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'status_change_request',
          title: 'Session Update Request',
          body: 'Jordan Trainer requested a completed mark.',
          read: true,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
        {
          id: 'notification-2',
          type: 'status_change_request',
          title: 'Session Update Request',
          body: 'Jordan Trainer requested a completed mark.',
          read: false,
          createdAt: '2026-04-06T11:00:00.000Z',
        },
      ],
      unreadCount: 1,
      error: null,
    })

    await act(async () => {
      root.render(<NotificationsPanel />)
    })

    const clearAllButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Clear All',
    )

    if (!(clearAllButton instanceof HTMLButtonElement)) {
      throw new Error('Clear All button not found.')
    }

    await act(async () => {
      clearAllButton.click()
    })

    expect(archiveClearableNotificationsMock).toHaveBeenCalledWith('user-1', 'admin')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'archived'],
    })
    expect(markAllNotificationsAsReadMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(3)
  })
})
