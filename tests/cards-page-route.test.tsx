import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockForbidden, mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/components/cards-inventory-page', () => ({
  CardsInventoryPage: () => <div>cards inventory content</div>,
}))

import CardsPage from '@/app/(app)/cards/page'

describe('CardsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetServerAuthMocks()
  })

  it('renders the cards inventory page for admins', async () => {
    const page = await CardsPage()

    expect(renderToStaticMarkup(page)).toContain('cards inventory content')
  })

  it('redirects unauthenticated users to /login', async () => {
    mockUnauthorized()

    await CardsPage()

    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('redirects forbidden users to /unauthorized', async () => {
    mockForbidden()

    await CardsPage()

    expect(redirectMock).toHaveBeenCalledWith('/unauthorized')
  })
})
