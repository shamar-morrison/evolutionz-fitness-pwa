import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types'

const { createClientMock, readStaffProfileMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

import {
  requireAdminUser,
  requireAuthenticatedProfile,
  requireAuthenticatedUser,
} from '@/lib/server-auth'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'user-1',
    name: overrides.name ?? 'Jordan Trainer',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Trainer'],
    isSuspended: overrides.isSuspended ?? false,
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
  }
}

function mockSupabaseUserResult(options: {
  user: { id: string; email: string } | null
  error: { message: string } | null
}) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: options.user,
        },
        error: options.error,
      }),
    },
  })
}

describe('server auth helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    readStaffProfileMock.mockReset()
  })

  it('requireAuthenticatedUser returns the user when the session is valid', async () => {
    mockSupabaseUserResult({
      user: {
        id: 'user-1',
        email: 'jordan@evolutionzfitness.com',
      },
      error: null,
    })

    const result = await requireAuthenticatedUser()

    expect('response' in result).toBe(false)

    if ('response' in result) {
      throw new Error('Expected an authenticated user result.')
    }

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'jordan@evolutionzfitness.com',
    })
  })

  it('requireAuthenticatedUser returns 401 when auth.getUser() errors', async () => {
    mockSupabaseUserResult({
      user: null,
      error: {
        message: 'Auth session missing.',
      },
    })

    const result = await requireAuthenticatedUser()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected an auth failure response.')
    }

    expect(result.response.status).toBe(401)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('requireAuthenticatedUser returns 401 when no session user exists', async () => {
    mockSupabaseUserResult({
      user: null,
      error: null,
    })

    const result = await requireAuthenticatedUser()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected an auth failure response.')
    }

    expect(result.response.status).toBe(401)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('requireAuthenticatedProfile returns the profile when authenticated', async () => {
    const profile = createProfile()
    mockSupabaseUserResult({
      user: {
        id: profile.id,
        email: profile.email,
      },
      error: null,
    })
    readStaffProfileMock.mockResolvedValue(profile)

    const result = await requireAuthenticatedProfile()

    expect('response' in result).toBe(false)

    if ('response' in result) {
      throw new Error('Expected an authenticated profile result.')
    }

    expect(result.user).toEqual({
      id: profile.id,
      email: profile.email,
    })
    expect(result.profile).toEqual(profile)
  })

  it('requireAuthenticatedProfile returns 403 when the profile is suspended', async () => {
    mockSupabaseUserResult({
      user: {
        id: 'user-1',
        email: 'jordan@evolutionzfitness.com',
      },
      error: null,
    })
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        isSuspended: true,
      }),
    )

    const result = await requireAuthenticatedProfile()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected a suspended auth failure response.')
    }

    expect(result.response.status).toBe(403)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Your account has been suspended. Please contact an administrator.',
    })
  })

  it('requireAuthenticatedProfile returns 403 when the profile is missing', async () => {
    mockSupabaseUserResult({
      user: {
        id: 'user-1',
        email: 'jordan@evolutionzfitness.com',
      },
      error: null,
    })
    readStaffProfileMock.mockResolvedValue(null)

    const result = await requireAuthenticatedProfile()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected a missing profile auth failure response.')
    }

    expect(result.response.status).toBe(403)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('requireAdminUser returns the user and profile for admins', async () => {
    const profile = createProfile({
      role: 'admin',
      titles: ['Owner'],
    })
    mockSupabaseUserResult({
      user: {
        id: profile.id,
        email: profile.email,
      },
      error: null,
    })
    readStaffProfileMock.mockResolvedValue(profile)

    const result = await requireAdminUser()

    expect('response' in result).toBe(false)

    if ('response' in result) {
      throw new Error('Expected an admin auth success result.')
    }

    expect(result.user).toEqual({
      id: profile.id,
      email: profile.email,
    })
    expect(result.profile).toEqual(profile)
  })

  it('requireAdminUser returns 403 for staff profiles', async () => {
    mockSupabaseUserResult({
      user: {
        id: 'user-1',
        email: 'jordan@evolutionzfitness.com',
      },
      error: null,
    })
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        role: 'staff',
      }),
    )

    const result = await requireAdminUser()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected a forbidden admin auth response.')
    }

    expect(result.response.status).toBe(403)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('requireAdminUser returns 401 when unauthenticated', async () => {
    mockSupabaseUserResult({
      user: null,
      error: null,
    })

    const result = await requireAdminUser()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected an unauthenticated admin auth response.')
    }

    expect(result.response.status).toBe(401)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })
})
