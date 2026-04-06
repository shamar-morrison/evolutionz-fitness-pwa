import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}))

const { readStaffProfileMock } = vi.hoisted(() => ({
  readStaffProfileMock: vi.fn(),
}))

vi.mock('@/lib/staff', () => ({
  readStaffProfile: readStaffProfileMock,
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
    readStaffProfileMock.mockReset()
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
    readStaffProfileMock.mockResolvedValue({
      id: 'user-1',
      role: 'admin',
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/dashboard')
  })

  it('redirects authenticated staff /login requests to /trainer/schedule', async () => {
    mockSupabaseUser({
      id: 'user-2',
      email: 'trainer@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-2',
      role: 'staff',
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/trainer/schedule')
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
