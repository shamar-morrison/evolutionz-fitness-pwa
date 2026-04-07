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
  useRescheduleRequestsMock,
  useSessionUpdateRequestsMock,
} = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'admin@evolutionzfitness.com' },
    profile: {
      id: 'user-1',
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
  useRescheduleRequestsMock: vi.fn(),
  useSessionUpdateRequestsMock: vi.fn(),
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

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
  useRouter: () => ({
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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: signOutMock,
    },
  }),
}))

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

describe('Sidebar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(max-width: 767px)',
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

  it('shows the trainer-only navigation for staff users', async () => {
    pathnameState.value = '/trainer/schedule'
    authState.role = 'staff'
    authState.profile = {
      id: 'trainer-1',
      name: 'Jordan Trainer',
      role: 'staff',
      titles: ['Trainer'],
    }
    authState.user = { id: 'trainer-1', email: 'trainer@evolutionzfitness.com' }

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
    expect(container.textContent).not.toContain('Dashboard')
    expect(container.textContent).not.toContain('Pending Approvals')
  })

  it('shows the admin navigation and caps the pending approvals badge at 9+', async () => {
    pathnameState.value = '/pending-approvals/session-updates'
    authState.role = 'admin'
    authState.profile = {
      id: 'user-1',
      name: 'Admin User',
      role: 'admin',
      titles: ['Owner'],
    }
    authState.user = { id: 'user-1', email: 'admin@evolutionzfitness.com' }
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

    await act(async () => {
      root.render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      )
    })

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Notifications')
    expect(container.textContent).toContain('Reschedule Requests')
    expect(container.textContent).toContain('Session Updates')

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'))

    expect(links).toContain('/pending-approvals/reschedule-requests')
    expect(links).toContain('/pending-approvals/session-updates')

    const badges = Array.from(container.querySelectorAll('[data-sidebar="menu-badge"]')).map(
      (badge) => badge.textContent?.trim(),
    )

    expect(badges).toContain('9+')
    expect(badges).toContain('5')
  })
})
