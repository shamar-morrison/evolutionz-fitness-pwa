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

vi.mock('@/app/(app)/reports/members/member-reports-client', () => ({
  MemberReportsClient: () => <div>Member Reports Client</div>,
}))

import MemberReportsPage from '@/app/(app)/reports/members/page'

describe('MemberReportsPage', () => {
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
      root.render(<MemberReportsPage />)
    })

    expect(container.textContent).toBe('')
  })

  it('renders the member reports client when reports access is allowed', async () => {
    permissionsState.can.mockReturnValue(true)

    await act(async () => {
      root.render(<MemberReportsPage />)
    })

    expect(container.textContent).toContain('Member Reports Client')
    expect(container.textContent).not.toContain('Redirected Home')
  })

  it('renders the authenticated-home redirect fallback when reports access is denied', async () => {
    permissionsState.can.mockReturnValue(false)

    await act(async () => {
      root.render(<MemberReportsPage />)
    })

    expect(container.textContent).toContain('Redirected Home')
    expect(container.textContent).not.toContain('Member Reports Client')
  })
})
