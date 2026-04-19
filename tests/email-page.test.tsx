// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authState, permissionsState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'admin-1', email: 'admin@evolutionzfitness.com' },
    profile: {
      id: 'admin-1',
      email: 'admin@evolutionzfitness.com',
      name: 'Admin User',
      role: 'admin' as 'admin' | 'staff',
      titles: ['Owner'],
    },
    role: 'admin' as 'admin' | 'staff',
    loading: false,
  },
  permissionsState: {
    can: vi.fn(() => true),
  },
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissionsState,
}))

vi.mock('@/components/authenticated-home-redirect', () => ({
  AuthenticatedHomeRedirect: () => <div>Redirected Home</div>,
}))

vi.mock('@/app/(app)/email/email-client', () => ({
  EmailClient: ({ resendDailyLimit }: { resendDailyLimit: number }) => (
    <div data-limit={resendDailyLimit}>Email Client</div>
  ),
}))

import EmailPage from '@/app/(app)/email/page'

describe('EmailPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    authState.loading = false
    authState.role = 'admin'
    permissionsState.can.mockReturnValue(true)
    delete process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
    delete process.env.RESEND_DAILY_EMAIL_LIMIT
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('renders nothing while auth is still loading', async () => {
    authState.loading = true

    await act(async () => {
      root.render(<EmailPage />)
    })

    expect(container.textContent).toBe('')
  })

  it('renders the email client for admins and passes the configured public daily limit', async () => {
    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '125'

    await act(async () => {
      root.render(<EmailPage />)
    })

    expect(container.textContent).toContain('Email Client')
    expect(container.querySelector('[data-limit]')?.getAttribute('data-limit')).toBe('125')
  })

  it('renders the authenticated-home redirect fallback for non-admin users', async () => {
    authState.role = 'staff'

    await act(async () => {
      root.render(<EmailPage />)
    })

    expect(container.textContent).toContain('Redirected Home')
    expect(container.textContent).not.toContain('Email Client')
  })

  it('falls back to the default daily limit when the public env value is invalid', async () => {
    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = 'invalid'

    await act(async () => {
      root.render(<EmailPage />)
    })

    expect(container.querySelector('[data-limit]')?.getAttribute('data-limit')).toBe('100')
  })
})
