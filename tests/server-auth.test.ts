import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
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

import { requireAuthenticatedProfile } from '@/lib/server-auth'

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

describe('requireAuthenticatedProfile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    createClientMock.mockReset()
    readStaffProfileMock.mockReset()
  })

  it('returns 403 for suspended staff profiles', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-1',
              email: 'jordan@evolutionzfitness.com',
            },
          },
          error: null,
        }),
      },
    })
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        isSuspended: true,
      }),
    )

    const result = await requireAuthenticatedProfile()

    expect('response' in result).toBe(true)

    if (!('response' in result)) {
      throw new Error('Expected an auth failure response.')
    }

    expect(result.response.status).toBe(403)
    await expect(result.response.json()).resolves.toEqual({
      error: 'Your account has been suspended. Please contact an administrator.',
    })
  })

  it('returns the authenticated profile when the account is active', async () => {
    const profile = createProfile()

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: profile.id,
              email: profile.email,
            },
          },
          error: null,
        }),
      },
    })
    readStaffProfileMock.mockResolvedValue(profile)

    const result = await requireAuthenticatedProfile()

    expect('response' in result).toBe(false)

    if ('response' in result) {
      throw new Error('Expected an authenticated profile result.')
    }

    expect(result.profile).toEqual(profile)
  })
})
