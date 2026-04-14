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

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

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

  it('uses the page-only matcher that excludes APIs and public PWA assets', () => {
    expect(config.matcher).toEqual([
      '/((?!_next/static|_next/image|favicon.ico|api/|offline(?:/.*)?$|manifest\\.json$|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
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

  it('redirects authenticated /login requests to /dashboard for admins', async () => {
    mockSupabaseUser({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-1',
      role: 'admin',
      titles: ['Owner'],
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/dashboard')
  })

  it('redirects authenticated /login requests to /trainer/schedule for staff', async () => {
    mockSupabaseUser({
      id: 'user-2',
      email: 'trainer@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-2',
      role: 'staff',
      titles: ['Trainer'],
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/trainer/schedule')
  })

  it('redirects authenticated /login requests to /members for front desk staff', async () => {
    mockSupabaseUser({
      id: 'user-4',
      email: 'assistant@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-4',
      role: 'staff',
      titles: ['Assistant'],
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/members')
  })

  it('redirects suspended users from protected routes to /suspended', async () => {
    mockSupabaseUser({
      id: 'user-5',
      email: 'suspended@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-5',
      role: 'staff',
      titles: ['Trainer'],
      isSuspended: true,
    })

    const response = await updateSession(createRequest('/members'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/suspended')
  })

  it('redirects suspended users away from /login to /suspended', async () => {
    mockSupabaseUser({
      id: 'user-6',
      email: 'suspended@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-6',
      role: 'staff',
      titles: ['Trainer'],
      isSuspended: true,
    })

    const response = await updateSession(createRequest('/login'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/suspended')
  })

  it('allows suspended users to remain on /suspended', async () => {
    mockSupabaseUser({
      id: 'user-7',
      email: 'suspended@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-7',
      role: 'staff',
      titles: ['Trainer'],
      isSuspended: true,
    })

    const response = await updateSession(createRequest('/suspended'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects active authenticated users away from /suspended', async () => {
    mockSupabaseUser({
      id: 'user-8',
      email: 'trainer@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-8',
      role: 'staff',
      titles: ['Trainer'],
      isSuspended: false,
    })

    const response = await updateSession(createRequest('/suspended'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/trainer/schedule')
  })

  it('allows admins through protected routes', async () => {
    mockSupabaseUser({
      id: 'user-1',
      email: 'admin@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'user-1',
      role: 'admin',
      titles: ['Owner'],
    })

    const response = await updateSession(createRequest('/reports/revenue'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects trainers away from members list to /trainer/schedule', async () => {
    mockSupabaseUser({
      id: 'trainer-1',
      email: 'trainer@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'trainer-1',
      role: 'staff',
      titles: ['Trainer'],
    })

    const response = await updateSession(createRequest('/members'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/trainer/schedule')
  })

  it('redirects administrative assistants away from trainer routes to /members', async () => {
    mockSupabaseUser({
      id: 'assistant-1',
      email: 'assistant@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'assistant-1',
      role: 'staff',
      titles: ['Administrative Assistant'],
    })

    const response = await updateSession(createRequest('/trainer/requests'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/members')
  })

  it('redirects staff without permitted titles to /unauthorized', async () => {
    mockSupabaseUser({
      id: 'medical-1',
      email: 'medical@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue({
      id: 'medical-1',
      role: 'staff',
      titles: ['Medical'],
    })

    const response = await updateSession(createRequest('/classes'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/unauthorized')
  })

  it('redirects archived or missing-profile sessions back to /login', async () => {
    mockSupabaseUser({
      id: 'user-3',
      email: 'archived@evolutionzfitness.com',
    })
    readStaffProfileMock.mockResolvedValue(null)

    const response = await updateSession(createRequest('/members'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login')
  })
})
