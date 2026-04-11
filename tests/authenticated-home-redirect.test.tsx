// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  authState,
  getAuthenticatedHomePathMock,
  redirectOnMountMock,
} = vi.hoisted(() => ({
  authState: {
    profile: null as { titles?: string[] } | null,
    role: null as 'admin' | 'staff' | null,
    loading: false,
  },
  getAuthenticatedHomePathMock: vi.fn(),
  redirectOnMountMock: vi.fn(({ href }: { href: string }) => (
    <div data-testid="redirect-on-mount">{href}</div>
  )),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/lib/auth-redirect', () => ({
  getAuthenticatedHomePath: getAuthenticatedHomePathMock,
}))

vi.mock('@/components/redirect-on-mount', () => ({
  RedirectOnMount: redirectOnMountMock,
}))

import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'

describe('AuthenticatedHomeRedirect', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    authState.profile = {
      titles: ['Administrative Assistant'],
    }
    authState.role = 'staff'
    authState.loading = false
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

  it('returns null while auth is still loading', async () => {
    authState.loading = true

    await act(async () => {
      root.render(<AuthenticatedHomeRedirect />)
    })

    expect(container.innerHTML).toBe('')
    expect(getAuthenticatedHomePathMock).not.toHaveBeenCalled()
    expect(redirectOnMountMock).not.toHaveBeenCalled()
  })

  it('resolves the authenticated home path after auth loading completes', async () => {
    getAuthenticatedHomePathMock.mockReturnValue('/members')

    await act(async () => {
      root.render(<AuthenticatedHomeRedirect />)
    })

    expect(getAuthenticatedHomePathMock).toHaveBeenCalledWith('staff', ['Administrative Assistant'])
    expect(redirectOnMountMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="redirect-on-mount"]')?.textContent).toBe(
      '/members',
    )
  })
})
