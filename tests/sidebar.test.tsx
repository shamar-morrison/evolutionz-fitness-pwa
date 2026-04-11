// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  pathnameState,
  pushMock,
  refreshMock,
  signOutMock,
  useMemberApprovalRequestsMock,
  useRescheduleRequestsMock,
  useSessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'admin@evolutionzfitness.com' },
    profile: {
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
    role: 'admin' as 'admin' | 'staff',
    loading: false,
  },
  pathnameState: {
    value: '/pending-approvals/session-updates',
  },
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  useMemberApprovalRequestsMock: vi.fn(),
  useRescheduleRequestsMock: vi.fn(),
  useSessionUpdateRequestsMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}))

vi.mock('@/hooks/use-progress-router', () => ({
  useProgressRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-pt-scheduling', () => ({
  useRescheduleRequests: useRescheduleRequestsMock,
  useSessionUpdateRequests: useSessionUpdateRequestsMock,
}))

vi.mock('@/hooks/use-member-approval-requests', () => ({
  useMemberApprovalRequests: useMemberApprovalRequestsMock,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: signOutMock,
    },
  }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: React.ComponentProps<'button'>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}))

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
}

function setAuthState({
  id,
  email,
  name,
  role,
  titles,
}: {
  id: string
  email: string
  name: string
  role: 'admin' | 'staff'
  titles: string[]
}) {
  authState.user = { id, email }
  authState.profile = {
    id,
    email,
    name,
    role,
    titles,
  }
  authState.role = role
  authState.loading = false
}

describe('Sidebar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    signOutMock.mockResolvedValue({ error: null })
    setAuthState({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    })
    pathnameState.value = '/pending-approvals/session-updates'
    setViewport(1024)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: window.innerWidth < 768,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useRescheduleRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })
    useSessionUpdateRequestsMock.mockReturnValue({
      requests: [],
      isLoading: false,
      error: null,
    })
    useMemberApprovalRequestsMock.mockReturnValue({
      requests: [],
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

  async function clickButtonByLabel(label: string) {
    const button = Array.from(document.body.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/gu, ' ').trim() === label,
    )

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`${label} button not found.`)
    }

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('shows the trainer-only navigation for staff users', async () => {
    pathnameState.value = '/trainer/schedule'
    setAuthState({
      id: 'trainer-1',
      email: 'trainer@evolutionzfitness.com',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    })

    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    expect(container.textContent).toContain('My Schedule')
    expect(container.textContent).toContain('My Clients')
    expect(container.textContent).toContain('My Requests')
    expect(container.textContent).toContain('Classes')
    expect(container.textContent).toContain('Trainer')
    expect(container.textContent).toContain('Log out')
    expect(container.textContent).not.toContain('Members')
    expect(container.textContent).not.toContain('Unlock Door')
    expect(container.textContent).not.toContain('Reports')
    expect(container.textContent).not.toContain('Notifications')
    expect(container.textContent).not.toContain('Settings')
    expect(container.textContent).not.toContain('Dashboard')
    expect(container.textContent).not.toContain('Pending Approvals')

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'))

    expect(links).toContain('/trainer/schedule')
    expect(links).toContain('/trainer/clients')
    expect(links).toContain('/trainer/requests')
    expect(links).toContain('/classes')
    expect(links).not.toContain('/members')

    const groupLabels = Array.from(container.querySelectorAll('[data-sidebar="group-label"]')).map(
      (label) => label.textContent?.trim(),
    )

    expect(groupLabels).toContain('Trainer')
    expect(groupLabels).toContain('Classes')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
    expect(useSessionUpdateRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
    expect(useMemberApprovalRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
  })

  it('shows only accessible staff links for administrative assistants', async () => {
    pathnameState.value = '/members'
    setAuthState({
      id: 'assistant-1',
      email: 'assistant@evolutionzfitness.com',
      name: 'Admin Assistant',
      role: 'staff',
      titles: ['Administrative Assistant'],
    })

    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    expect(container.textContent).toContain('Members')
    expect(container.textContent).toContain('Classes')
    expect(container.textContent).not.toContain('My Schedule')
    expect(container.textContent).not.toContain('My Clients')
    expect(container.textContent).not.toContain('My Requests')
    expect(container.textContent).toContain('Unlock Door')
    expect(container.textContent).not.toContain('Reports')
    expect(container.textContent).not.toContain('Notifications')
    expect(container.textContent).not.toContain('Settings')

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'))

    expect(links).toContain('/members')
    expect(links).toContain('/classes')
    expect(links).not.toContain('/trainer/clients')
    expect(links).not.toContain('/trainer/requests')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
    expect(useSessionUpdateRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
    expect(useMemberApprovalRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: false }),
    )
  })

  it('shows the admin navigation and caps the pending approvals badge at 9+', async () => {
    pathnameState.value = '/pending-approvals/session-updates'
    setAuthState({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    })
    useRescheduleRequestsMock.mockReturnValue({
      requests: new Array(11).fill(null).map((_, index) => ({ id: `reschedule-${index}` })),
      isLoading: false,
      error: null,
    })
    useSessionUpdateRequestsMock.mockReturnValue({
      requests: new Array(5).fill(null).map((_, index) => ({ id: `update-${index}` })),
      isLoading: false,
      error: null,
    })
    useMemberApprovalRequestsMock.mockReturnValue({
      requests: new Array(3).fill(null).map((_, index) => ({ id: `member-request-${index}` })),
      isLoading: false,
      error: null,
    })

    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Classes')
    expect(container.textContent).toContain('Reports')
    expect(container.textContent).toContain('PT Trainer Payments')
    expect(container.textContent).toContain('Group Class Payments')
    expect(container.textContent).toContain('Revenue Reports')
    expect(container.textContent).toContain('Notifications')
    expect(container.textContent).toContain('Member Requests')
    expect(container.textContent).toContain('Reschedule Requests')
    expect(container.textContent).toContain('Session Updates')
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('Unlock Door')
    expect(container.textContent).toContain('Log out')
    expect(container.querySelector('[data-sidebar="menu-action"]')).toBeNull()

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'))

    expect(links).toContain('/classes')
    expect(links).toContain('/reports/pt-payments')
    expect(links).toContain('/reports/class-payments')
    expect(links).toContain('/reports/revenue')
    expect(links).toContain('/pending-approvals/member-requests')
    expect(links).toContain('/pending-approvals/reschedule-requests')
    expect(links).toContain('/pending-approvals/session-updates')

    const groupLabels = Array.from(container.querySelectorAll('[data-sidebar="group-label"]')).map(
      (label) => label.textContent?.trim(),
    )

    expect(groupLabels).toContain('Application')
    expect(groupLabels).toContain('Reports')
    expect(groupLabels).toContain('Notifications')

    const badges = Array.from(container.querySelectorAll('[data-sidebar="menu-badge"]')).map(
      (badge) => badge.textContent?.trim(),
    )

    expect(badges).toContain('9+')
    expect(badges).toContain('3')
    expect(badges).toContain('5')
    expect(useRescheduleRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: true }),
    )
    expect(useSessionUpdateRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: true }),
    )
    expect(useMemberApprovalRequestsMock).toHaveBeenCalledWith(
      'pending',
      expect.objectContaining({ enabled: true }),
    )
  })

  it('navigates to settings from the footer user menu for admins', async () => {
    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    await clickButtonByLabel('Settings')

    expect(pushMock).toHaveBeenCalledWith('/settings')
  })

  it('signs out from the footer user menu', async () => {
    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    await clickButtonByLabel('Log out')

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/login')
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('closes the mobile sidebar after clicking a navigation link', async () => {
    pathnameState.value = '/dashboard'
    setAuthState({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    })
    setViewport(390)

    await act(async () => {
      root.render(
        <SidebarProvider>
          <SidebarTrigger />
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    const trigger = container.querySelector('[data-sidebar="trigger"]')

    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error('Sidebar trigger not found.')
    }

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })

    expect(document.body.querySelector('[data-mobile="true"]')).not.toBeNull()

    const dashboardLink = document.body.querySelector('[data-mobile="true"] a[href="/dashboard"]')

    if (!(dashboardLink instanceof HTMLAnchorElement)) {
      throw new Error('Mobile dashboard link not found.')
    }

    await act(async () => {
      dashboardLink.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    })

    expect(document.body.querySelector('[data-mobile="true"]')).toBeNull()
  })
})
