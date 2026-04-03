import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}))

import { config } from '@/proxy'
import { updateSession } from '@/lib/supabase/proxy'

function createRequest(pathname: string) {
  return new NextRequest(new URL(`http://localhost${pathname}`))
}

function mockSupabaseUser(user: { id: string; email: string } | null) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
  })

  createServerClientMock.mockReturnValue({
    auth: {
      getUser,
    },
  })

  return { getUser }
}

describe('updateSession', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  })

  it('uses the page-only matcher that excludes /api routes entirely', () => {
    expect(config.matcher).toEqual([
      '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ])
  })

  it('redirects unauthenticated page requests to /login', async () => {
    const { getUser } = mockSupabaseUser(null)

    const response = await updateSession(createRequest('/dashboard'))

    expect(createServerClientMock).toHaveBeenCalledOnce()
    expect(getUser).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login')
  })

  it('redirects authenticated /login requests to /dashboard', async () => {
    mockSupabaseUser({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/dashboard')
  })

  it('allows authenticated non-login page requests through', async () => {
    mockSupabaseUser({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
    })

    const response = await updateSession(createRequest('/members'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
})
